/**
 * Tests for backup engine2: RestoreVerifier, ScheduleOptimizer,
 * CrossRegionReplicator, KeyRotationEngine.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { BlockStorageEngine } from '../../engines/BlockStorageEngine';
import { BackupCatalogEngine } from '../../engines/BackupCatalogEngine';
import { BackupExecutorEngine } from '../../engines/BackupExecutorEngine';
import { BackupEncryptionEngine } from '../../engines/BackupEncryptionEngine';
import {
  BackupKind,
  BackupPolicy,
  TestClock,
  sha256,
  SourceSnapshot,
} from '../../engines/types';
import { RestoreVerifier, InMemoryScratchStore } from '../RestoreVerifier';
import { ScheduleOptimizer, amortizedStorage } from '../ScheduleOptimizer';
import { CrossRegionReplicator } from '../ReplicationStub';
import { KeyRotationEngine } from '../KeyRotation';
import { ContentDefinedChunker } from '../ContentChunker';
import { RestorePointDiffEngine } from '../RestorePointDiff';
import { ManifestSigner, MANIFEST_GENESIS } from '../ManifestSigner';

const POLICY: BackupPolicy = {
  id: 'p1',
  name: 'nightly',
  scope: ['src-a'],
  fullIntervalMs: 86_400_000,
  incrementalIntervalMs: 3_600_000,
  retention: { maxCount: 30, maxAgeMs: null, respectPins: true },
  requireEncryption: false,
};

function snap(obj: Record<string, string>): SourceSnapshot {
  return new Map(Object.entries(obj).map(([k, v]) => [k, Buffer.from(v)]));
}

describe('RestoreVerifier', () => {
  let clock: TestClock;
  let storage: BlockStorageEngine;
  let catalog: BackupCatalogEngine;
  let executor: BackupExecutorEngine;
  let verifier: RestoreVerifier;

  beforeEach(() => {
    clock = new TestClock(0);
    storage = new BlockStorageEngine();
    catalog = new BackupCatalogEngine();
    executor = new BackupExecutorEngine(storage, { blockSize: 8, clock });
    verifier = new RestoreVerifier(catalog, storage, { clock });
  });

  it('verifies a clean restore', () => {
    const rp = executor.runBackup(
      POLICY,
      'src-a',
      snap({ 'a.txt': 'hello world!!', 'b.txt': 'small' }),
      BackupKind.Full
    );
    catalog.index(rp);
    const scratch = new InMemoryScratchStore();
    const report = verifier.verifyRestore(rp.id, scratch);
    expect(report.ok).toBe(true);
    expect(report.verified).toBe(2);
    expect(report.failed).toBe(0);
    // Scratch holds the restored bytes.
    expect(scratch.get('restore:a.txt')?.toString()).toBe('hello world!!');
  });

  it('reports missing blocks', () => {
    const rp = executor.runBackup(POLICY, 'src-a', snap({ 'a.txt': 'abcabcabc' }), BackupKind.Full);
    catalog.index(rp);
    // Corrupt: remove the block for 'abcabcab' (first 8 bytes)
    const lostHash = rp.objects[0].blockHashes[0];
    (storage as unknown as { _blocks: Map<string, unknown> })._blocks.delete(lostHash);
    const report = verifier.verifyRestore(rp.id, new InMemoryScratchStore());
    expect(report.ok).toBe(false);
    const diff = report.diffs.find((d) => d.objectName === 'a.txt');
    expect(diff?.kind).toBe('missing-blocks');
  });

  it('reports checksum mismatch when content differs', () => {
    const rp = executor.runBackup(POLICY, 'src-a', snap({ 'a.txt': 'data' }), BackupKind.Full);
    catalog.index(rp);
    const scratch = new InMemoryScratchStore();
    // Tamper: overwrite the stored block with different plaintext
    const h = rp.objects[0].blockHashes[0];
    storage.put({ hash: h, data: Buffer.from('XXXX'), size: 4, encrypted: false, nonce: null, authTag: null });
    // put() is dedup-guarded — force overwrite:
    (storage as unknown as { _blocks: Map<string, unknown> })._blocks.set(h, {
      hash: h,
      data: Buffer.from('XXXX'),
      size: 4,
      encrypted: false,
      nonce: null,
      authTag: null,
    });
    const report = verifier.verifyRestore(rp.id, scratch);
    expect(report.ok).toBe(false);
    expect(report.diffs[0].kind).toBe('checksum-mismatch');
  });

  it('throws for unknown restore points', () => {
    expect(() => verifier.verifyRestore('nope', new InMemoryScratchStore())).toThrow();
  });
});

describe('ScheduleOptimizer', () => {
  const opt = new ScheduleOptimizer();

  it('picks the tightest interval honoring maxRpo', () => {
    const res = opt.optimize(
      [
        {
          sourceId: 'db',
          sizeBytes: 1e9,
          changeBytesPerMs: 1e3,
          retentionMs: 86_400_000,
        },
      ],
      {
        storageBudgetBytes: 1e12,
        minIntervalMs: 60_000,
        maxIntervalMs: 86_400_000,
        maxRpoMs: 7_200_000, // must back up at least every 14.4M ms
      }
    );
    expect(res.feasible).toBe(true);
    // Interval/2 must be ≤ maxRpo; first grid candidate is minInterval.
    expect(res.plans[0].expectedRpoMs).toBeLessThanOrEqual(7_200_000);
    expect(res.plans[0].intervalMs).toBeGreaterThanOrEqual(60_000);
  });

  it('reports infeasible when maxRpo unreachable', () => {
    const res = opt.optimize(
      [{ sourceId: 's', sizeBytes: 100, changeBytesPerMs: 0, retentionMs: 1000 }],
      {
        storageBudgetBytes: 1e9,
        minIntervalMs: 60_000,
        maxIntervalMs: 120_000,
        maxRpoMs: 1000, // interval/2 ≤ 1000 → interval ≤ 2000 < minInterval
      }
    );
    expect(res.feasible).toBe(false);
    expect(res.reason).toContain('maxRpoMs');
  });

  it('amortizedStorage grows with churn', () => {
    const w = { sourceId: 's', sizeBytes: 1000, changeBytesPerMs: 10, retentionMs: 100_000 };
    expect(amortizedStorage(w, 1000)).toBeGreaterThan(1000);
  });

  it('handles multiple sources under a shared budget', () => {
    const res = opt.optimize(
      [
        { sourceId: 'a', sizeBytes: 500, changeBytesPerMs: 1, retentionMs: 10_000 },
        { sourceId: 'b', sizeBytes: 500, changeBytesPerMs: 1, retentionMs: 10_000 },
      ],
      { storageBudgetBytes: 1e9, minIntervalMs: 1000, maxIntervalMs: 10_000 }
    );
    expect(res.feasible).toBe(true);
    expect(res.plans.length).toBe(2);
  });
});

describe('CrossRegionReplicator', () => {
  let clock: TestClock;
  let source: BlockStorageEngine;
  let replica: BlockStorageEngine;
  let rep: CrossRegionReplicator;

  function put(store: BlockStorageEngine, data: string): string {
    const h = sha256(Buffer.from(data));
    store.put({ hash: h, data: Buffer.from(data), size: data.length, encrypted: false, nonce: null, authTag: null });
    return h;
  }

  beforeEach(() => {
    clock = new TestClock(0);
    source = new BlockStorageEngine();
    replica = new BlockStorageEngine();
    rep = new CrossRegionReplicator(source, replica, clock);
  });

  it('replicates queued blocks in order', () => {
    const h1 = put(source, 'one');
    const h2 = put(source, 'two');
    rep.enqueue([h1, h2]);
    expect(rep.queueDepth).toBe(2);
    const res = rep.sync();
    expect(res.replicated).toBe(2);
    expect(replica.get(h1)?.data.toString()).toBe('one');
    expect(replica.get(h2)?.data.toString()).toBe('two');
    expect(rep.queueDepth).toBe(0);
  });

  it('tracks lag by count and wall-clock', () => {
    const h = put(source, 'x');
    rep.enqueue([h]);
    clock.advance(5000);
    const lag = rep.lag();
    expect(lag.blocksBehind).toBe(1);
    expect(lag.wallClockLagMs).toBe(5000);
    rep.sync();
    expect(rep.lag().blocksBehind).toBe(0);
    expect(rep.lag().wallClockLagMs).toBe(0);
  });

  it('partial syncs leave the queue for resumption', () => {
    const hashes = ['a', 'b', 'c', 'd'].map((d) => put(source, d));
    rep.enqueue(hashes);
    const r1 = rep.sync(2);
    expect(r1.replicated).toBe(2);
    expect(rep.queueDepth).toBe(2);
    const r2 = rep.sync(2);
    expect(r2.replicated).toBe(2);
    expect(rep.queueDepth).toBe(0);
  });

  it('deduplicates blocks already at the replica', () => {
    const h = put(source, 'shared');
    put(replica, 'shared'); // same content → same hash
    rep.enqueue([h]);
    const res = rep.sync();
    expect(res.replicated).toBe(0);
    expect(res.deduplicated).toBe(1);
  });

  it('enqueueMissing only queues what replica lacks', () => {
    const a = put(source, 'a');
    const b = put(source, 'b');
    put(replica, 'a');
    const added = rep.enqueueMissing([a, b]);
    expect(added).toBe(1);
    expect(rep.queueDepth).toBe(1);
  });
});

describe('KeyRotationEngine', () => {
  let clock: TestClock;
  let storage: BlockStorageEngine;
  let oldKey: BackupEncryptionEngine;
  let newKey: BackupEncryptionEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    storage = new BlockStorageEngine();
    oldKey = new BackupEncryptionEngine(BackupEncryptionEngine.generateKey());
    newKey = new BackupEncryptionEngine(BackupEncryptionEngine.generateKey());
  });

  function putEncrypted(data: string): string {
    const payload = oldKey.encrypt(Buffer.from(data));
    const h = sha256(Buffer.from(data));
    storage.put({
      hash: h,
      data: payload.ciphertext,
      size: payload.ciphertext.length,
      encrypted: true,
      nonce: payload.nonce,
      authTag: payload.authTag,
    });
    return h;
  }

  it('re-encrypts blocks under the new key', () => {
    const h = putEncrypted('secret');
    const rot = new KeyRotationEngine(storage, { clock });
    const report = rot.rotate([h], oldKey, newKey, 'k2');
    expect(report.blocksReEncrypted).toBe(1);
    expect(report.failures).toBe(0);
    // New key decrypts; old key must fail.
    const block = storage.get(h)!;
    const plain = newKey.decrypt({ ciphertext: block.data, nonce: block.nonce!, authTag: block.authTag! });
    expect(plain.toString()).toBe('secret');
    expect(() =>
      oldKey.decrypt({ ciphertext: block.data, nonce: block.nonce!, authTag: block.authTag! })
    ).toThrow();
  });

  it('skips plaintext blocks', () => {
    const h = sha256(Buffer.from('plain'));
    storage.put({ hash: h, data: Buffer.from('plain'), size: 5, encrypted: false, nonce: null, authTag: null });
    const rot = new KeyRotationEngine(storage);
    const report = rot.rotate([h], oldKey, newKey, 'k2');
    expect(report.skipped).toBe(1);
    expect(report.blocksReEncrypted).toBe(0);
  });

  it('reports failures without aborting the batch', () => {
    const good = putEncrypted('ok');
    const bad = sha256(Buffer.from('corrupt'));
    storage.put({
      hash: bad,
      data: Buffer.from('not-really-ciphertext'),
      size: 21,
      encrypted: true,
      nonce: Buffer.alloc(12),
      authTag: Buffer.alloc(16),
    });
    const rot = new KeyRotationEngine(storage);
    const report = rot.rotate([good, bad], oldKey, newKey, 'k2');
    expect(report.blocksReEncrypted).toBe(1);
    expect(report.failures).toBe(1);
    expect(report.errors.length).toBe(1);
  });

  it('batches large rotations', () => {
    const hashes = Array.from({ length: 5 }, (_, i) => putEncrypted(`data-${i}`));
    const rot = new KeyRotationEngine(storage, { clock, batchSize: 2 });
    let total = 0;
    let passes = 0;
    for (;;) {
      const r = rot.rotate(hashes, oldKey, newKey, 'k2');
      total += r.blocksReEncrypted;
      passes++;
      if (r.blocksReEncrypted < 2) break;
      if (passes > 10) break;
    }
    expect(total).toBe(5);
    expect(passes).toBe(3); // 2 + 2 + 1
  });
});

describe('ContentDefinedChunker', () => {
  const chunker = new ContentDefinedChunker({ minBytes: 64, avgBytes: 256, maxBytes: 1024 });

  it('produces deterministic chunk boundaries', () => {
    const data = Buffer.alloc(4096, 'x');
    const a = chunker.chunk(data);
    const b = chunker.chunk(Buffer.from(data));
    expect(a.map((c) => c.hash)).toEqual(b.map((c) => c.hash));
    expect(a.length).toBeGreaterThan(0);
  });

  it('respects min/max chunk sizes', () => {
    const data = Buffer.alloc(4096, 0x61);
    const chunks = chunker.chunk(data);
    for (const c of chunks.slice(0, -1)) {
      expect(c.length).toBeGreaterThanOrEqual(64);
      expect(c.length).toBeLessThanOrEqual(1024);
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    expect(total).toBe(4096);
  });

  it('inserted bytes shift only nearby chunks (dedup survives)', () => {
    const base = Buffer.alloc(4096);
    for (let i = 0; i < base.length; i++) base[i] = i % 251;
    const orig = chunker.chunk(base);

    // Insert 1 byte near the front
    const shifted = Buffer.concat([base.subarray(0, 100), Buffer.from([0xff]), base.subarray(100)]);
    const after = chunker.chunk(shifted);

    const origHashes = new Set(orig.map((c) => c.hash));
    const surviving = after.filter((c) => origHashes.has(c.hash)).length;
    // Most chunks re-find their boundaries — dedup ratio should be high
    // even though every fixed-size block after offset 100 would change.
    expect(surviving).toBeGreaterThanOrEqual(Math.floor(after.length * 0.5));
  });

  it('returns empty array for empty input', () => {
    expect(chunker.chunk(Buffer.alloc(0))).toEqual([]);
  });

  it('chunkWithDedup reports fresh vs deduplicated', () => {
    const data = Buffer.alloc(2048, 'q');
    const first = chunker.chunk(data);
    const baseline = new Set(first.map((c) => c.hash));
    const res = chunker.chunkWithDedup(new Map([['f', Buffer.from(data)]]), baseline);
    expect(res.deduplicated).toBe(res.chunks.length);
    expect(res.fresh).toBe(0);
    const res2 = chunker.chunkWithDedup(
      new Map([['f', Buffer.from(data)], ['g', Buffer.alloc(3000, 'z')]]),
      baseline
    );
    expect(res2.fresh).toBeGreaterThan(0);
  });
});

describe('RestorePointDiffEngine', () => {
  const differ = new RestorePointDiffEngine();
  let clock: TestClock;
  let storage: BlockStorageEngine;
  let executor: BackupExecutorEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    storage = new BlockStorageEngine();
    executor = new BackupExecutorEngine(storage, { blockSize: 8, clock });
  });

  it('reports added, removed, changed, unchanged', () => {
    const rp1 = executor.runBackup(
      POLICY,
      'src-a',
      snap({ 'keep.txt': 'same', 'gone.txt': 'bye', 'mod.txt': 'v1' }),
      BackupKind.Full
    );
    clock.advance(1000);
    const rp2 = executor.runBackup(
      POLICY,
      'src-a',
      snap({ 'keep.txt': 'same', 'mod.txt': 'v2-changed!!', 'new.txt': 'brand new' }),
      BackupKind.Full
    );
    const d = differ.diff(rp1, rp2);
    expect(d.added.map((x) => x.name)).toEqual(['new.txt']);
    expect(d.removed.map((x) => x.name)).toEqual(['gone.txt']);
    expect(d.changed.map((x) => x.name)).toEqual(['mod.txt']);
    expect(d.unchangedCount).toBe(1);
    expect(d.newBlockCount).toBeGreaterThan(0);
  });

  it('block-level diff shows churned hashes', () => {
    // 16 bytes at blockSize 8 → two blocks [aaaaaaaa, aaaaaaaaa].
    // Change the SECOND half: after = [aaaaaaaa, bbbbbbbb].
    const rp1 = executor.runBackup(POLICY, 'src-a', snap({ 'f.txt': 'aaaaaaaaaaaaaaaa' }), BackupKind.Full);
    const rp2 = executor.runBackup(POLICY, 'src-a', snap({ 'f.txt': 'aaaaaaaabbbbbbbb' }), BackupKind.Full);
    const d = differ.diff(rp1, rp2);
    expect(d.changed.length).toBe(1);
    const ch = d.changed[0];
    expect(ch.blocksShared).toBe(1); // first block identical
    expect(ch.blocksAdded!.length).toBe(1); // 'bbbbbbbb' is new
    expect(ch.blocksRemoved!.length).toBe(0); // shared 'aaaaaaaa' remains
  });

  it('renders text diff', () => {
    const rp1 = executor.runBackup(POLICY, 'src-a', snap({ 'a': 'x' }), BackupKind.Full);
    const rp2 = executor.runBackup(POLICY, 'src-a', snap({ 'a': 'x', 'b': 'y' }), BackupKind.Full);
    const text = differ.renderText(differ.diff(rp1, rp2));
    expect(text).toContain('RESTORE-POINT DIFF');
    expect(text).toContain('+1 added');
    expect(text).toContain('b');
  });

  it('identical restore points diff clean', () => {
    const rp1 = executor.runBackup(POLICY, 'src-a', snap({ 'a': 'x' }), BackupKind.Full);
    const rp2 = executor.runBackup(POLICY, 'src-a', snap({ 'a': 'x' }), BackupKind.Full);
    const d = differ.diff(rp1, rp2);
    expect(d.added.length).toBe(0);
    expect(d.changed.length).toBe(0);
    expect(d.removed.length).toBe(0);
    expect(d.unchangedCount).toBe(1);
  });
});

describe('ManifestSigner', () => {
  let clock: TestClock;
  let storage: BlockStorageEngine;
  let executor: BackupExecutorEngine;
  let signer: ManifestSigner;

  beforeEach(() => {
    clock = new TestClock(0);
    storage = new BlockStorageEngine();
    executor = new BackupExecutorEngine(storage, { blockSize: 8, clock });
    signer = new ManifestSigner(clock);
  });

  it('signs manifests into a chain', () => {
    const rp1 = executor.runBackup(POLICY, 'src-a', snap({ 'a': 'x' }), BackupKind.Full);
    const s1 = signer.sign(rp1, 'k1');
    expect(s1.manifestDigest.length).toBe(64);
    expect(s1.chainDigest).not.toBe(MANIFEST_GENESIS);
    const rp2 = executor.runBackup(POLICY, 'src-a', snap({ 'a': 'x', 'b': 'y' }), BackupKind.Full);
    const s2 = signer.sign(rp2, 'k1');
    expect(s2.chainDigest).not.toBe(s1.chainDigest); // chained
  });

  it('verifies a signed manifest', () => {
    const rp = executor.runBackup(POLICY, 'src-a', snap({ 'a': 'x' }), BackupKind.Full);
    signer.sign(rp, 'k1');
    expect(signer.verify(rp).ok).toBe(true);
    expect(signer.verify(rp, true).ok).toBe(true);
    const unsigned = { ...rp, id: 'nope' };
    expect(signer.verify(unsigned).ok).toBe(false);
  });

  it('detects manifest tampering', () => {
    const rp = executor.runBackup(POLICY, 'src-a', snap({ 'a': 'x' }), BackupKind.Full);
    signer.sign(rp, 'k1');
    const tampered = { ...rp, objects: [...rp.objects, { name: 'evil', blockHashes: [], size: 0, checksum: 'x' }] };
    expect(signer.verify(tampered).ok).toBe(false);
  });

  it('reanchor re-signs the chain under a new key without changing manifest digests', () => {
    const rp1 = executor.runBackup(POLICY, 'src-a', snap({ 'a': 'x' }), BackupKind.Full);
    const rp2 = executor.runBackup(POLICY, 'src-a', snap({ 'a': 'y' }), BackupKind.Full);
    const s1 = signer.sign(rp1, 'k1');
    signer.sign(rp2, 'k1');
    const re = signer.reanchor('k2');
    expect(re.length).toBe(2);
    expect(re[0].manifestDigest).toBe(s1.manifestDigest); // preserved
    expect(re[0].keyId).toBe('k2');
    expect(signer.verifyChain().ok).toBe(true);
  });
});
