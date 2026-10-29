import { describe, it, expect, beforeEach } from 'bun:test';
import { BlockStorageEngine } from '../engines/BlockStorageEngine';
import { BackupEncryptionEngine } from '../engines/BackupEncryptionEngine';
import { BackupExecutorEngine } from '../engines/BackupExecutorEngine';
import { BackupCatalogEngine } from '../engines/BackupCatalogEngine';
import { RestorePlannerEngine } from '../engines/RestorePlannerEngine';
import { IntegrityVerificationEngine } from '../engines/IntegrityVerificationEngine';
import { RetentionPruningEngine } from '../engines/RetentionPruningEngine';
import { PolicySchedulerEngine } from '../engines/PolicySchedulerEngine';
import {
  BackupKind,
  BackupPolicy,
  RestorePoint,
  SourceSnapshot,
  TestClock,
  DAY_MS as _D,
  sha256,
} from '../engines/types';

const DAY_MS = 24 * 60 * 60 * 1000;

function snap(entries: Record<string, string>): SourceSnapshot {
  const m = new Map<string, Buffer>();
  for (const [k, v] of Object.entries(entries)) m.set(k, Buffer.from(v, 'utf8'));
  return m;
}

function makePolicy(overrides: Partial<BackupPolicy> = {}): BackupPolicy {
  return {
    id: 'pol-1',
    name: 'daily',
    scope: ['src-1'],
    fullIntervalMs: 7 * DAY_MS,
    incrementalIntervalMs: DAY_MS,
    retention: { maxCount: 3, maxAgeMs: null, respectPins: true },
    requireEncryption: false,
    ...overrides,
  };
}

describe('BlockStorageEngine', () => {
  it('deduplicates identical blocks by content hash', () => {
    const s = new BlockStorageEngine();
    const data = Buffer.from('hello');
    const h = sha256(data);
    s.put({ hash: h, data, size: 5, encrypted: false, nonce: null, authTag: null });
    s.put({ hash: h, data: Buffer.from('hello'), size: 5, encrypted: false, nonce: null, authTag: null });
    expect(s.blockCount()).toBe(1);
    expect(s.storedBytes()).toBe(5);
  });

  it('sweeps only unreferenced blocks', () => {
    const s = new BlockStorageEngine();
    const h1 = sha256(Buffer.from('a'));
    const h2 = sha256(Buffer.from('b'));
    s.put({ hash: h1, data: Buffer.from('a'), size: 1, encrypted: false, nonce: null, authTag: null });
    s.put({ hash: h2, data: Buffer.from('b'), size: 1, encrypted: false, nonce: null, authTag: null });
    s.retain(h1);
    const freed = s.sweep();
    expect(freed).toBe(1);
    expect(s.has(h1)).toBe(true);
    expect(s.has(h2)).toBe(false);
  });
});

describe('BackupEncryptionEngine', () => {
  it('round-trips AES-256-GCM', () => {
    const enc = new BackupEncryptionEngine(BackupEncryptionEngine.generateKey());
    const payload = enc.encrypt(Buffer.from('secret data'));
    expect(payload.ciphertext.equals(Buffer.from('secret data'))).toBe(false);
    expect(enc.decrypt(payload).toString()).toBe('secret data');
  });

  it('rejects wrong key and tampered ciphertext', () => {
    const enc1 = new BackupEncryptionEngine(BackupEncryptionEngine.generateKey());
    const enc2 = new BackupEncryptionEngine(BackupEncryptionEngine.generateKey());
    const payload = enc1.encrypt(Buffer.from('x'));
    expect(() => enc2.decrypt(payload)).toThrow();
    payload.ciphertext[0] = payload.ciphertext[0]! ^ 0xff;
    expect(() => enc1.decrypt(payload)).toThrow();
  });

  it('requires a 32-byte key', () => {
    expect(() => new BackupEncryptionEngine(Buffer.alloc(16))).toThrow();
  });
});

describe('BackupExecutorEngine', () => {
  let clock: TestClock;
  let storage: BlockStorageEngine;
  let executor: BackupExecutorEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    storage = new BlockStorageEngine();
    executor = new BackupExecutorEngine(storage, { blockSize: 8, clock });
  });

  it('full backup stores all blocks and manifest', () => {
    const rp = executor.runBackup(makePolicy(), 'src-1', snap({ 'a.txt': 'abcdefghijklmnop' }), BackupKind.Full);
    expect(rp.kind).toBe(BackupKind.Full);
    expect(rp.objects[0]!.blockHashes.length).toBe(2); // 16 bytes / 8
    expect(storage.blockCount()).toBe(2);
  });

  it('incremental dedups unchanged blocks', () => {
    const policy = makePolicy();
    executor.runBackup(policy, 'src-1', snap({ 'a.txt': 'aaaaaaaa', 'b.txt': 'bbbbbbbb' }), BackupKind.Full);
    clock.advance(DAY_MS);
    // Change only b.txt
    const rp2 = executor.runBackup(
      policy,
      'src-1',
      snap({ 'a.txt': 'aaaaaaaa', 'b.txt': 'cccccccc' }),
      BackupKind.Incremental
    );
    expect(rp2.parentId).not.toBeNull();
    expect(rp2.newBlockHashes.length).toBe(1); // only b's new block stored
    expect(storage.blockCount()).toBe(3); // 2 original + 1 new
  });

  it('incremental without parent behaves like a full', () => {
    const rp = executor.runBackup(makePolicy(), 'src-1', snap({ x: 'data' }), BackupKind.Incremental);
    expect(rp.parentId).toBeNull();
  });

  it('restores objects byte-identical from any restore point', () => {
    const policy = makePolicy();
    executor.runBackup(policy, 'src-1', snap({ 'f.bin': 'VERSION-1!!' }), BackupKind.Full);
    clock.advance(DAY_MS);
    const rp2 = executor.runBackup(policy, 'src-1', snap({ 'f.bin': 'VERSION-2!!' }), BackupKind.Incremental);
    expect(executor.restoreObject(rp2.id, 'f.bin').toString()).toBe('VERSION-2!!');
  });

  it('encrypts blocks when policy requires it', () => {
    const key = BackupEncryptionEngine.generateKey();
    const encExecutor = new BackupExecutorEngine(storage, {
      blockSize: 8,
      clock,
      encryption: new BackupEncryptionEngine(key),
    });
    const rp = encExecutor.runBackup(
      makePolicy({ requireEncryption: true }),
      'src-1',
      snap({ s: 'topsecret' }),
      BackupKind.Full
    );
    expect(rp.encrypted).toBe(true);
    expect(encExecutor.restoreObject(rp.id, 's').toString()).toBe('topsecret');
  });

  it('rejects sources outside policy scope', () => {
    expect(() =>
      executor.runBackup(makePolicy(), 'other-src', snap({ x: 'y' }), BackupKind.Full)
    ).toThrow();
  });
});

describe('BackupCatalogEngine + RestorePlannerEngine', () => {
  let clock: TestClock;
  let catalog: BackupCatalogEngine;
  let planner: RestorePlannerEngine;
  let executor: BackupExecutorEngine;
  let rps: RestorePoint[];

  beforeEach(() => {
    clock = new TestClock(0);
    const storage = new BlockStorageEngine();
    executor = new BackupExecutorEngine(storage, { blockSize: 8, clock });
    catalog = new BackupCatalogEngine();
    planner = new RestorePlannerEngine(catalog);
    const policy = makePolicy();
    rps = [];
    // day 0 full, day 1 inc, day 2 inc
    for (let d = 0; d < 3; d++) {
      clock.set(d * DAY_MS);
      const rp = executor.runBackup(
        policy,
        'src-1',
        snap({ 'db': `db-v${d}-pad`, 'log': `log-${d}-pad` }),
        d === 0 ? BackupKind.Full : BackupKind.Incremental
      );
      catalog.index(rp);
      rps.push(rp);
    }
  });

  it('finds the latest restore point before a target time', () => {
    const rp = catalog.latestBefore('src-1', DAY_MS + 1);
    expect(rp!.id).toBe(rps[1]!.id);
  });

  it('builds a restore plan with the full dependency chain', () => {
    const plan = planner.plan('src-1', 2 * DAY_MS);
    expect(plan.steps.length).toBe(3);
    expect(plan.steps[0]!.kind).toBe(BackupKind.Full);
    expect(plan.restorableObjects.sort()).toEqual(['db', 'log']);
  });

  it('searches by object name and time range', () => {
    const hits = catalog.search({ objectName: 'db', sinceMs: DAY_MS });
    expect(hits.length).toBe(2);
  });

  it('reports objects changed since parent', () => {
    // make day-2 backup identical for 'log'
    expect(planner.changedObjects('src-1', 2 * DAY_MS).sort()).toEqual(['db', 'log']);
  });
});

describe('IntegrityVerificationEngine', () => {
  let clock: TestClock;
  let storage: BlockStorageEngine;
  let executor: BackupExecutorEngine;
  let integrity: IntegrityVerificationEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    storage = new BlockStorageEngine();
    executor = new BackupExecutorEngine(storage, { blockSize: 8, clock });
    integrity = new IntegrityVerificationEngine(storage);
  });

  it('verifies a healthy restore point', () => {
    const rp = executor.runBackup(makePolicy(), 'src-1', snap({ f: 'healthy-data-here' }), BackupKind.Full);
    const report = integrity.verify(rp);
    expect(report.ok).toBe(true);
    expect(report.missingBlocks).toEqual([]);
  });

  it('detects a missing block', () => {
    const rp = executor.runBackup(makePolicy(), 'src-1', snap({ f: 'data-to-lose!!' }), BackupKind.Full);
    const doomedHash = rp.objects[0]!.blockHashes[0]!;
    (storage as unknown as { _blocks: Map<string, unknown> })._blocks.delete(doomedHash);
    const report = integrity.verify(rp);
    expect(report.ok).toBe(false);
    expect(report.missingBlocks).toContain(doomedHash);
  });

  it('detects corrupted block content', () => {
    const rp = executor.runBackup(makePolicy(), 'src-1', snap({ f: 'corruptme' }), BackupKind.Full);
    const hash = rp.objects[0]!.blockHashes[0]!;
    const block = storage.get(hash)!;
    block.data[0] = block.data[0]! ^ 0xff; // flip a bit
    const report = integrity.verify(rp);
    expect(report.ok).toBe(false);
    expect(report.corruptBlocks).toContain(hash);
  });

  it('detects manifest tampering', () => {
    const rp = executor.runBackup(makePolicy(), 'src-1', snap({ f: 'tamper' }), BackupKind.Full);
    rp.manifestChecksum = 'forged';
    expect(integrity.verify(rp).manifestTampered).toBe(true);
  });
});

describe('RetentionPruningEngine', () => {
  let clock: TestClock;
  let storage: BlockStorageEngine;
  let executor: BackupExecutorEngine;
  let catalog: BackupCatalogEngine;
  let pruner: RetentionPruningEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    storage = new BlockStorageEngine();
    executor = new BackupExecutorEngine(storage, { blockSize: 8, clock });
    catalog = new BackupCatalogEngine();
    pruner = new RetentionPruningEngine(catalog, executor, storage, clock);
  });

  function runSeries(count: number, prefix: string): RestorePoint[] {
    const policy = makePolicy();
    const out: RestorePoint[] = [];
    for (let i = 0; i < count; i++) {
      clock.set(i * DAY_MS);
      const rp = executor.runBackup(
        policy,
        'src-1',
        snap({ f: `${prefix}-${i}-xxxxxxxx` }),
        i === 0 ? BackupKind.Full : BackupKind.Incremental
      );
      catalog.index(rp);
      out.push(rp);
    }
    return out;
  }

  it('keeps only maxCount newest restore points', () => {
    runSeries(5, 'v');
    clock.set(10 * DAY_MS);
    const result = pruner.prune(makePolicy({ retention: { maxCount: 3, maxAgeMs: null, respectPins: true } }), 'src-1');
    expect(result.pruned.length).toBe(2);
    expect(result.kept.length).toBe(3);
    // Newest survive
    expect(catalog.latestBefore('src-1', 10 * DAY_MS)).not.toBeNull();
  });

  it('prunes by age', () => {
    runSeries(4, 'a');
    clock.set(3 * DAY_MS + 1); // now: ages are 3d+1ms, 2d+1ms, 1d+1ms, 1ms
    const result = pruner.prune(makePolicy({ retention: { maxCount: null, maxAgeMs: 2.5 * DAY_MS, respectPins: true } }), 'src-1');
    expect(result.pruned.length).toBe(1); // only day-0 is older than 2.5d
    expect(result.kept.length).toBe(3);
  });

  it('respects pinned restore points', () => {
    const rps = runSeries(4, 'p');
    pruner.pin(rps[0]!.id);
    clock.set(10 * DAY_MS);
    const result = pruner.prune(makePolicy({ retention: { maxCount: 2, maxAgeMs: null, respectPins: true } }), 'src-1');
    expect(result.skippedPinned).toContain(rps[0]!.id);
    expect(result.kept).toContain(rps[0]!.id);
  });

  it('frees block storage after pruning', () => {
    runSeries(3, 'f');
    clock.set(10 * DAY_MS);
    const before = storage.blockCount();
    pruner.prune(makePolicy({ retention: { maxCount: 1, maxAgeMs: null, respectPins: true } }), 'src-1');
    expect(storage.blockCount()).toBeLessThan(before);
  });

  it('kept restore points still restore correctly after prune', () => {
    const rps = runSeries(3, 'k');
    clock.set(10 * DAY_MS);
    pruner.prune(makePolicy({ retention: { maxCount: 1, maxAgeMs: null, respectPins: true } }), 'src-1');
    expect(executor.restoreObject(rps[2]!.id, 'f').toString()).toBe('k-2-xxxxxxxx');
  });

  it('dryRun predicts prune without mutating', () => {
    runSeries(4, 'd');
    clock.set(10 * DAY_MS);
    const doomed = pruner.dryRun(makePolicy({ retention: { maxCount: 2, maxAgeMs: null, respectPins: true } }), 'src-1');
    expect(doomed.length).toBe(2);
    expect(catalog.count()).toBe(4); // nothing deleted
  });
});

describe('PolicySchedulerEngine', () => {
  let clock: TestClock;
  let sched: PolicySchedulerEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    sched = new PolicySchedulerEngine(clock);
    sched.registerPolicy(makePolicy());
  });

  it('marks never-run work as due', () => {
    expect(sched.isDue('pol-1', 'src-1', BackupKind.Full)).toBe(true);
  });

  it('not due until interval elapses', () => {
    sched.recordRun('pol-1', 'src-1', BackupKind.Full);
    expect(sched.isDue('pol-1', 'src-1', BackupKind.Full)).toBe(false);
    clock.advance(7 * DAY_MS + 1);
    expect(sched.isDue('pol-1', 'src-1', BackupKind.Full)).toBe(true);
  });

  it('full supersedes a simultaneously-due incremental', () => {
    clock.advance(8 * DAY_MS); // both intervals elapsed
    const work = sched.dueWork();
    const src1 = work.filter((w) => w.sourceId === 'src-1');
    expect(src1.length).toBe(1);
    expect(src1[0]!.kind).toBe(BackupKind.Full);
  });
});
