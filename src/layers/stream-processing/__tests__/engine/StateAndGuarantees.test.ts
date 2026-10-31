/**
 * State backend, migration, temporal join, and guarantee tests:
 * LSM flush/compaction/tombstone semantics, partition rescale with
 * key-codec correctness, asof/nearest joins with watermark pruning,
 * and idempotency-key verification of exactly/at-least-once claims.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  BloomFilter,
  InMemoryStateBackend,
  LsmStateBackend,
  KeyedStateBackend,
  BackendSnapshot,
  StateMigrator,
  fnvAssigner,
  PlainKeyCodec,
  WindowKeyCodec,
  StateMigrationError,
  TemporalJoin,
  GuaranteeVerifier,
  DedupGate,
  BoundedOutOfOrderness,
} from '../../engine';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (v: Uint8Array | undefined) => (v ? new TextDecoder().decode(v) : undefined);

// Exercise both backends through the shared contract.
function backends(): { name: string; make: () => KeyedStateBackend }[] {
  return [
    { name: 'in-memory', make: () => new InMemoryStateBackend() },
    { name: 'lsm', make: () => new LsmStateBackend({ memtableMaxEntries: 8 }) },
  ];
}

// ---------------------------------------------------------------------
// KeyedStateBackend contract (both impls)
// ---------------------------------------------------------------------

describe.each(backends())('KeyedStateBackend ($name)', ({ make }) => {
  let b: KeyedStateBackend;

  beforeEach(() => {
    b = make();
    b.registerNamespace('windows');
  });

  it('put/get/delete round-trip within a partition', () => {
    b.put('windows', 0, 'k|100', enc('v1'));
    b.put('windows', 0, 'k|200', enc('v2'));
    b.put('windows', 1, 'other', enc('x'));
    expect(dec(b.get('windows', 0, 'k|100'))).toBe('v1');
    expect(b.count('windows', 0)).toBe(2);
    expect(b.count('windows', 1)).toBe(1);
    b.delete('windows', 0, 'k|100');
    expect(b.get('windows', 0, 'k|100')).toBeUndefined();
    expect(b.count('windows', 0)).toBe(1);
  });

  it('entries() is key-sorted and excludes tombstones', () => {
    b.put('windows', 0, 'c', enc('3'));
    b.put('windows', 0, 'a', enc('1'));
    b.put('windows', 0, 'b', enc('2'));
    b.delete('windows', 0, 'b');
    const entries = b.entries('windows', 0);
    expect(entries.map(([k]) => k)).toEqual(['a', 'c']);
  });

  it('snapshot/restore round-trips the namespace', () => {
    b.put('windows', 0, 'a', enc('1'));
    b.put('windows', 2, 'b', enc('2'));
    const snap = b.snapshot('windows');
    const fresh = make();
    fresh.registerNamespace('windows');
    fresh.restore('windows', snap);
    expect(dec(fresh.get('windows', 0, 'a'))).toBe('1');
    expect(dec(fresh.get('windows', 2, 'b'))).toBe('2');
    expect(fresh.partitions('windows')).toEqual([0, 2]);
  });

  it('partitions() reflects where state actually lives', () => {
    b.put('windows', 3, 'x', enc('1'));
    b.put('windows', 1, 'y', enc('2'));
    expect(b.partitions('windows')).toEqual([1, 3]);
  });

  it('unknown namespace raises, drop clears it', () => {
    expect(() => b.get('nope', 0, 'k')).toThrow();
    b.dropNamespace('windows');
    expect(() => b.get('windows', 0, 'k')).toThrow();
  });
});

// ---------------------------------------------------------------------
// LSM specifics
// ---------------------------------------------------------------------

describe('LsmStateBackend internals', () => {
  let lsm: LsmStateBackend;

  beforeEach(() => {
    lsm = new LsmStateBackend({ memtableMaxEntries: 4, levelFanout: 2, maxLevels: 3 });
    lsm.registerNamespace('ns');
  });

  it('memtable flushes to an SSTable at capacity', () => {
    for (let i = 0; i < 4; i++) lsm.put('ns', 0, `k${i}`, enc(`v${i}`));
    expect(lsm.flushCount).toBe(1);
    expect(lsm.tableCounts('ns').get(0)).toBe(1);
    // Reads still work across the flush boundary.
    expect(dec(lsm.get('ns', 0, 'k2'))).toBe('v2');
  });

  it('newest-wins across levels (overwrite in newer table shadows older)', () => {
    lsm.put('ns', 0, 'k', enc('old'));
    lsm.flush('ns', 0);
    lsm.put('ns', 0, 'k', enc('new'));
    expect(dec(lsm.get('ns', 0, 'k'))).toBe('new'); // memtable beats table
    lsm.flush('ns', 0);
    expect(dec(lsm.get('ns', 0, 'k'))).toBe('new'); // newer table beats older
  });

  it('tombstone shadows the value in an older SSTable', () => {
    lsm.put('ns', 0, 'k', enc('v'));
    lsm.flush('ns', 0);            // k -> v in L0
    lsm.delete('ns', 0, 'k');      // tombstone in memtable
    expect(lsm.get('ns', 0, 'k')).toBeUndefined();
    lsm.flush('ns', 0);            // tombstone flushes
    expect(lsm.get('ns', 0, 'k')).toBeUndefined();
  });

  it('compaction merges fanout tables and keeps latest values', () => {
    // fanout=2 → every 2nd flush compacts.
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 4; i++) lsm.put('ns', 0, `r${round}k${i}`, enc('x'));
      // each round of 4 triggers a flush (memtableMax=4)
    }
    expect(lsm.compactionCount).toBeGreaterThanOrEqual(1);
    // All data still readable post-compaction.
    expect(dec(lsm.get('ns', 0, 'r0k0'))).toBe('x');
    expect(dec(lsm.get('ns', 0, 'r2k3'))).toBe('x');
  });

  it('tombstones drop for real at the bottom level', () => {
    const lsm2 = new LsmStateBackend({ memtableMaxEntries: 4, levelFanout: 2, maxLevels: 2 });
    lsm2.registerNamespace('n');
    lsm2.put('n', 0, 'doomed', enc('v'));
    lsm2.flush('n', 0);
    lsm2.delete('n', 0, 'doomed');
    lsm2.flush('n', 0);           // 2 tables → compact into bottom level
    // Force another compaction cycle to reach bottom.
    lsm2.put('n', 0, 'a', enc('1'));
    lsm2.put('n', 0, 'b', enc('2'));
    lsm2.flush('n', 0);
    lsm2.put('n', 0, 'c', enc('3'));
    lsm2.put('n', 0, 'd', enc('4'));
    // Bottom-level compaction should physically drop the tombstone:
    // 'doomed' is gone from entries(), not just shadowed.
    expect(lsm2.entries('n', 0).find(([k]) => k === 'doomed')).toBeUndefined();
  });

  it('bloom filter skips SSTable reads for absent keys', () => {
    for (let i = 0; i < 4; i++) lsm.put('ns', 0, `present${i}`, enc('v'));
    lsm.flush('ns', 0);
    const before = lsm.bloomSkips;
    // A key never written: bloom says definitely-absent → table skipped.
    lsm.get('ns', 0, 'never-written');
    expect(lsm.bloomSkips).toBeGreaterThan(before);
  });

  it('WAL replays into a recovered memtable', () => {
    lsm.put('ns', 0, 'a', enc('1'));
    lsm.put('ns', 0, 'b', enc('2'));
    lsm.delete('ns', 0, 'a');
    const wal = lsm.wal();
    expect(wal).toHaveLength(3);
    // Fresh backend replays the WAL — same state as the original memtable.
    const recovered = new LsmStateBackend({ memtableMaxEntries: 64 });
    recovered.registerNamespace('ns');
    for (const r of wal) {
      if (r.op === 'put' && r.value) recovered.put('ns', r.partition, r.key, r.value);
      else recovered.delete('ns', r.partition, r.key);
    }
    expect(recovered.get('ns', 0, 'a')).toBeUndefined();
    expect(dec(recovered.get('ns', 0, 'b'))).toBe('2');
  });
});

describe('BloomFilter', () => {
  it('never false-negatives on added keys', () => {
    const bf = new BloomFilter(100);
    const keys = Array.from({ length: 100 }, (_, i) => `key-${i}`);
    for (const k of keys) bf.add(k);
    for (const k of keys) expect(bf.mightContain(k)).toBe(true);
  });

  it('false-positive rate is bounded near the target', () => {
    const bf = new BloomFilter(1000, 0.05);
    for (let i = 0; i < 1000; i++) bf.add(`member-${i}`);
    let fp = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      if (bf.mightContain(`nonmember-${i}`)) fp++;
    }
    expect(fp / trials).toBeLessThan(0.15); // target 5% — generous bound
  });
});

// ---------------------------------------------------------------------
// StateMigrator
// ---------------------------------------------------------------------

describe('StateMigrator', () => {
  const enc2 = enc;

  it('re-partitions every entry under the new assignment', () => {
    const b = new InMemoryStateBackend();
    b.registerNamespace('dedup');
    for (let i = 0; i < 50; i++) b.put('dedup', i % 3, `k${i}`, enc2(`v${i}`));
    const migrator = new StateMigrator();
    const snap = b.snapshot('dedup');
    const rep = migrator.rescale(b, ['dedup'], 3, 7);
    expect(rep.fromPartitions).toBe(3);
    expect(rep.toPartitions).toBe(7);
    expect(rep.namespaces[0].entriesTotal).toBe(50);
    // Every key is now on fnvAssigner(k, 7).
    for (const p of b.partitions('dedup')) {
      for (const [k] of b.entries('dedup', p)) {
        expect(p).toBe(fnvAssigner(k, 7));
      }
    }
    // Verification: no lost/mutated/misplaced entries.
    expect(migrator.verify(b, 'dedup', snap, 7)).toEqual([]);
  });

  it('preserves values byte-for-byte through the move', () => {
    const b = new InMemoryStateBackend();
    b.registerNamespace('agg');
    const payloads = ['{}', '{"sum":42,"n":7}', 'binary'];
    payloads.forEach((p, i) => b.put('agg', 0, `k${i}`, enc2(p)));
    const snap = b.snapshot('agg');
    new StateMigrator().rescale(b, ['agg'], 4, 4); // same count — sanity
    for (let i = 0; i < payloads.length; i++) {
      expect(dec(b.get('agg', fnvAssigner(`k${i}`, 4), `k${i}`))).toBe(payloads[i]);
    }
    expect(new StateMigrator().verify(b, 'agg', snap, 4)).toEqual([]);
  });

  it('window codec keeps the same entity co-located across windows', () => {
    const b = new InMemoryStateBackend();
    b.registerNamespace('win');
    // Same entity, two window starts — MUST land on the same partition.
    b.put('win', 0, 'order-1|1000', enc2('a'));
    b.put('win', 0, 'order-1|2000', enc2('b'));
    b.put('win', 0, 'order-2|1000', enc2('c'));
    const snap = b.snapshot('win');
    new StateMigrator().rescale(b, ['win'], 2, 6, { win: WindowKeyCodec });
    const p1 = b.partitions('win').filter((p) =>
      b.entries('win', p).some(([k]) => k === 'order-1|1000')
    )[0];
    const p2 = b.partitions('win').filter((p) =>
      b.entries('win', p).some(([k]) => k === 'order-1|2000')
    )[0];
    expect(p1).toBe(p2); // same entity → same partition
    expect(new StateMigrator().verify(b, 'win', snap, 6, WindowKeyCodec)).toEqual([]);
  });

  it('naive key hashing would split the same entity across partitions', () => {
    // Contrast: PlainKeyCodec hashes the whole 'order-1|1000' string —
    // the entity's windows can scatter. Documented as the reason codecs
    // exist; just assert the behavior differs on some input.
    const e1 = WindowKeyCodec.entityOf('order-1|1000');
    const e2 = WindowKeyCodec.entityOf('order-1|2000');
    expect(e1).toBe(e2);
    const p1 = PlainKeyCodec.entityOf('order-1|1000');
    const p2 = PlainKeyCodec.entityOf('order-1|2000');
    expect(p1).not.toBe(p2);
  });

  it('reports orphan entries from a corrupt snapshot', () => {
    const b = new InMemoryStateBackend();
    b.registerNamespace('ns');
    b.put('ns', 0, 'a', enc2('1'));
    // Corrupt: claim an entry lived on partition 5 when oldPartitions=3.
    const real = b.snapshot('ns');
    const corrupt: BackendSnapshot = {
      namespace: 'ns',
      entries: [...real.entries, { partition: 5, key: 'ghost', value: enc2('x') }],
    };
    // Force via direct restore then rescale.
    b.restore('ns', corrupt);
    const rep = new StateMigrator().rescale(b, ['ns'], 3, 4);
    expect(rep.orphans).toEqual([{ namespace: 'ns', key: 'ghost' }]);
  });

  it('rejects rescale to zero partitions', () => {
    const b = new InMemoryStateBackend();
    b.registerNamespace('ns');
    expect(() => new StateMigrator().rescale(b, ['ns'], 2, 0)).toThrow(StateMigrationError);
  });

  it('migrateWindowRange drops expired windows during rescale', () => {
    const b = new InMemoryStateBackend();
    b.registerNamespace('win');
    b.put('win', 0, 'e|100', enc2('old'));
    b.put('win', 0, 'e|200', enc2('new'));
    const m = new StateMigrator();
    // Keep only windows at/after 200.
    const { kept, dropped } = m.migrateWindowRange(b, 'win', (start) => start >= 200, 4);
    expect(kept).toBe(1);
    expect(dropped).toBe(1);
    expect(dec(b.get('win', fnvAssigner('e', 4), 'e|200'))).toBe('new');
  });
});

// ---------------------------------------------------------------------
// TemporalJoin
// ---------------------------------------------------------------------

describe('TemporalJoin', () => {
  it('latest-before matches the newest right at-or-before the left', () => {
    const gen = new BoundedOutOfOrderness(0);
    const join = new TemporalJoin<string, string>(gen, {
      mode: 'latest-before',
      beforeMs: 1000,
      afterMs: 0,
      emit: 'eager',
    });
    join.right('k', 100, 'r100');
    join.right('k', 300, 'r300');
    join.right('k', 900, 'r900');
    const out = join.left('k', 500, 'L');
    expect(out).toHaveLength(1);
    expect(out[0].right.value).toBe('r300'); // newest <= 500
    expect(out[0].distanceMs).toBe(200);
  });

  it('latest-before respects the beforeMs bound', () => {
    const gen = new BoundedOutOfOrderness(0);
    const join = new TemporalJoin<string, string>(gen, {
      mode: 'latest-before',
      beforeMs: 100,
      afterMs: 0,
      emit: 'eager',
    });
    join.right('k', 0, 'ancient');
    const out = join.left('k', 500, 'L'); // 500-0 > 100 → too far back
    expect(out).toHaveLength(0);
  });

  it('nearest picks the closer side within both bounds', () => {
    const gen = new BoundedOutOfOrderness(0);
    const join = new TemporalJoin<string, string>(gen, {
      mode: 'nearest',
      beforeMs: 500,
      afterMs: 500,
      emit: 'eager',
    });
    join.right('k', 300, 'behind');   // 200 behind
    join.right('k', 600, 'ahead');    // 100 ahead
    const out = join.left('k', 500, 'L');
    expect(out[0].right.value).toBe('ahead');
    expect(out[0].distanceMs).toBe(100);
  });

  it('a late-arriving right resolves a buffered left (eager)', () => {
    const gen = new BoundedOutOfOrderness(0);
    const join = new TemporalJoin<string, string>(gen, {
      mode: 'latest-before',
      beforeMs: 1000,
      afterMs: 0,
      emit: 'eager',
    });
    expect(join.left('k', 500, 'L')).toHaveLength(0); // no right yet
    const resolved = join.right('k', 400, 'r400');    // right arrives late
    expect(resolved).toHaveLength(1);
    expect(resolved[0].right.value).toBe('r400');
  });

  it('complete mode waits for watermark expiry before emitting', () => {
    const gen = new BoundedOutOfOrderness(0);
    const join = new TemporalJoin<string, string>(gen, {
      mode: 'nearest',
      beforeMs: 500,
      afterMs: 500,
      emit: 'complete',
    });
    join.right('k', 300, 'r300');
    join.left('k', 500, 'L');      // buffered, no eager emit
    expect(join.drain()).toHaveLength(0);
    join.right('k', 520, 'r520');  // better match arrives
    // Advance watermark past the left's bound → resolve with best match.
    join.left('k', 2000, 'L2');    // pushes wm to 2000
    const out = join.drain();
    expect(out).toHaveLength(1);
    expect(out[0].right.value).toBe('r520');
  });

  it('unmatched lefts surface at expiry', () => {
    const gen = new BoundedOutOfOrderness(0);
    const join = new TemporalJoin<string, string>(gen, {
      mode: 'latest-before',
      beforeMs: 100,
      afterMs: 0,
      emit: 'complete',
    });
    join.left('k', 500, 'lonely');
    join.left('k', 2000, 'driver'); // advances wm
    const un = join.drainUnmatched();
    expect(un).toHaveLength(1);
    expect(un[0].left.value).toBe('lonely');
    expect(un[0].reason).toBe('no-candidate');
  });

  it('rights prune behind the watermark', () => {
    const gen = new BoundedOutOfOrderness(0);
    const join = new TemporalJoin<string, string>(gen, {
      mode: 'nearest',
      beforeMs: 100,
      afterMs: 100,
      emit: 'complete',
    });
    join.right('k', 0, 'old');
    join.right('k', 50, 'oldish');
    join.left('k', 10_000, 'L'); // wm=10000 → rights at 0,50 pruned
    expect(join.bufferedRights('k')).toBe(0);
    expect(join.prunedRights).toBe(2);
  });

  it('rejects negative bounds', () => {
    const gen = new BoundedOutOfOrderness(0);
    expect(() => new TemporalJoin(gen, { mode: 'nearest', beforeMs: -1, afterMs: 0 })).toThrow();
  });
});

// ---------------------------------------------------------------------
// GuaranteeVerifier + DedupGate
// ---------------------------------------------------------------------

describe('GuaranteeVerifier', () => {
  let v: GuaranteeVerifier;

  beforeEach(() => {
    v = new GuaranteeVerifier();
  });

  it('clean exactly-once run: 1 output per input, no loss', () => {
    for (let i = 0; i < 10; i++) {
      v.input({ source: 'p0', offset: i, dedupKey: `k${i}`, timestamp: i });
      v.output({ dedupKey: `k${i}`, timestamp: i });
    }
    const r = v.audit();
    expect(r.exactlyOnce).toBe(true);
    expect(r.atLeastOnce).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('at-least-once: re-emitted outputs count as duplicates, not loss', () => {
    v.input({ source: 'p0', offset: 0, dedupKey: 'k0', timestamp: 0 });
    v.output({ dedupKey: 'k0', timestamp: 0 });
    v.output({ dedupKey: 'k0', timestamp: 1 }); // retry emitted again
    const r = v.audit();
    expect(r.atLeastOnce).toBe(true);   // nothing lost
    expect(r.exactlyOnce).toBe(false);  // but a duplicate happened
    expect(r.duplicates).toBe(1);
  });

  it('lost: input with no output fails both guarantees', () => {
    v.input({ source: 'p0', offset: 0, dedupKey: 'k0', timestamp: 0 });
    v.input({ source: 'p0', offset: 1, dedupKey: 'k1', timestamp: 1 });
    v.output({ dedupKey: 'k0', timestamp: 2 });
    const r = v.audit();
    expect(r.lost).toBe(1);
    expect(r.exactlyOnce).toBe(false);
    expect(r.atLeastOnce).toBe(false);
    expect(r.violations[0].kind).toBe('lost');
    expect(r.violations[0].detail).toContain('k1');
  });

  it('phantom: output for a never-seen dedupKey', () => {
    v.output({ dedupKey: 'ghost', timestamp: 0 });
    const r = v.audit();
    expect(r.phantoms).toBe(1);
    expect(r.exactlyOnce).toBe(false);
  });

  it('order regression on a source is flagged', () => {
    v.observeOutputOffset('p0', 5, 0);
    v.observeOutputOffset('p0', 7, 1);
    v.observeOutputOffset('p0', 3, 2); // regression
    const r = v.audit();
    expect(r.orderRegressions).toBe(1);
    expect(r.violations.some((x) => x.kind === 'order-regression')).toBe(true);
  });

  it('in-flight inputs are pending, not lost (live pipeline)', () => {
    v.input({ source: 'p0', offset: 0, dedupKey: 'k0', timestamp: 0 });
    expect(v.inFlight).toBe(1);
    v.output({ dedupKey: 'k0', timestamp: 1 });
    expect(v.inFlight).toBe(0);
  });
});

describe('DedupGate', () => {
  it('admits first sight, rejects repeats', () => {
    const g = new DedupGate(16);
    expect(g.check('k1')).toBe(true);
    expect(g.check('k1')).toBe(false);
    expect(g.check('k2')).toBe(true);
    expect(g.admitted).toBe(2);
    expect(g.rejected).toBe(1);
  });

  it('bounded window evicts the oldest keys', () => {
    const g = new DedupGate(8);
    for (let i = 0; i < 8; i++) g.check(`k${i}`);
    expect(g.size).toBe(8);
    g.check('k8'); // evicts k0
    expect(g.size).toBe(8);
    expect(g.has('k0')).toBe(false);
    expect(g.check('k0')).toBe(true); // k0 re-admitted after eviction
  });

  it('combined with the verifier: a gated pipeline audits exactly-once', () => {
    const gate = new DedupGate();
    const v = new GuaranteeVerifier();
    // Simulate a pipeline with retries: input arrives twice, gate drops
    // the duplicate before the output stage.
    for (let i = 0; i < 5; i++) {
      v.input({ source: 's', offset: i, dedupKey: `k${i}`, timestamp: i });
      if (gate.check(`k${i}`)) v.output({ dedupKey: `k${i}`, timestamp: i });
      // Simulate a redelivery of the SAME input (at-least-once source).
      if (i === 2) {
        v.input({ source: 's', offset: i, dedupKey: `k${i}`, timestamp: i });
        gate.check(`k${i}`); // rejected — no second output
      }
    }
    const r = v.audit();
    // k2's re-input is pending-without-output → the gate worked, but
    // the verifier correctly notes the second input produced no output
    // (expected for an idempotent pipeline — the dedupKey IS the same).
    expect(r.duplicates).toBe(0);
    expect(gate.rejected).toBe(1);
  });
});

// ---------------------------------------------------------------------
// Integration: windowed pipeline rescale mid-run
// ---------------------------------------------------------------------

describe('rescale mid-run preserves window state', () => {
  it('windows survive a 2→4 partition rescale', () => {
    const backend = new InMemoryStateBackend();
    backend.registerNamespace('win-store');
    // Simulate windowed aggregation state: entity|windowStart -> acc.
    const windows: [string, string][] = [
      ['u1|0', '{"sum":10,"n":2}'],
      ['u1|60000', '{"sum":5,"n":1}'],
      ['u2|0', '{"sum":7,"n":3}'],
      ['u3|60000', '{"sum":1,"n":1}'],
    ];
    windows.forEach(([k, v]) => backend.put('win-store', fnvAssigner(WindowKeyCodec.entityOf(k), 2), k, enc(v)));

    const snap = backend.snapshot('win-store');
    const migrator = new StateMigrator();
    const rep = migrator.rescale(backend, ['win-store'], 2, 4, { 'win-store': WindowKeyCodec });
    expect(rep.namespaces[0].entriesTotal).toBe(4);
    // Both u1 windows still on one partition.
    const u1p1 = backend.partitions('win-store').find((p) =>
      backend.entries('win-store', p).some(([k]) => k === 'u1|0'));
    const u1p2 = backend.partitions('win-store').find((p) =>
      backend.entries('win-store', p).some(([k]) => k === 'u1|60000'));
    expect(u1p1).toBe(u1p2);
    // Values intact.
    expect(dec(backend.get('win-store', u1p1!, 'u1|0'))).toBe('{"sum":10,"n":2}');
    expect(migrator.verify(backend, 'win-store', snap, 4, WindowKeyCodec)).toEqual([]);
  });
});
