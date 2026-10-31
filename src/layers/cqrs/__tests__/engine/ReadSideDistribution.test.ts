/**
 * Distributed read-side tests: sharded read models, read-model
 * replication + staleness, query cache with projection-driven
 * invalidation, consistency SLO tracking, and replica-aware routing.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import { ProjectionOp } from '../../implementations/Denormalizer';
import {
  ShardedReadModel,
  hashRouter,
  fieldRouter,
  ShardedModelError,
  ReplicationJournal,
  ReplicaReadStore,
  ReadModelReplication,
  ReplicationGapError,
  QueryCache,
  ConsistencySla,
  ReplicaQueryRouter,
  ReadModelStore,
} from '../../engine';

const up = (id: string, doc: Record<string, unknown>): ProjectionOp => ({
  kind: 'upsert',
  id,
  document: doc,
});

// ---------------------------------------------------------------------
// ShardedReadModel
// ---------------------------------------------------------------------

describe('ShardedReadModel', () => {
  let m: ShardedReadModel;

  beforeEach(() => {
    m = new ShardedReadModel();
    m.registerModel({ name: 'orders', buckets: 4, indexes: ['customerId', 'status'] });
  });

  it('routes each doc to exactly one bucket deterministically', () => {
    for (let i = 0; i < 20; i++) {
      m.upsert('orders', `o${i}`, { id: `o${i}`, customerId: 'c1' });
    }
    expect(m.count('orders')).toBe(20);
    const dist = m.distribution('orders');
    expect(dist.reduce((a, b) => a + b, 0)).toBe(20);
    for (let i = 0; i < 20; i++) {
      const b = m.bucketOf('orders', `o${i}`);
      expect(m.bucketDocs('orders', b).some((d) => d.id === `o${i}`)).toBe(true);
    }
  });

  it('point reads hit the owning bucket only', () => {
    m.upsert('orders', 'o1', { customerId: 'c1', total: 50 });
    const doc = m.get('orders', 'o1');
    expect(doc?.total).toBe(50);
    expect(m.get('orders', 'missing')).toBeUndefined();
  });

  it('findBy scatter-gathers across buckets', () => {
    for (let i = 0; i < 10; i++) {
      m.upsert('orders', `o${i}`, { customerId: i % 2 === 0 ? 'even' : 'odd' });
    }
    const evens = m.findBy('orders', 'customerId', 'even');
    expect(evens).toHaveLength(5);
    for (const d of evens) expect(d.customerId).toBe('even');
  });

  it('applyBatch advances per-bucket checkpoints for touched buckets', () => {
    const ops: ProjectionOp[] = [up('o1', { v: 1 }), up('o2', { v: 2 })];
    m.applyBatch('proj', 10, 'orders', ops);
    const touched = new Set([m.bucketOf('orders', 'o1'), m.bucketOf('orders', 'o2')]);
    for (let b = 0; b < 4; b++) {
      const cp = m.bucketCheckpoint('proj', b);
      expect(cp).toBe(touched.has(b) ? 10 : -1);
    }
    // Whole-projection checkpoint = min over buckets (-1 while any bucket is cold).
    expect(m.checkpoint('proj', 4)).toBe(-1);
    m.applyBatch('proj', 8, 'orders', [up('o3', { v: 3 })]);
    m.applyBatch('proj', 8, 'orders', [up('o4', { v: 4 })]);
    m.applyBatch('proj', 8, 'orders', [up('o5', { v: 5 })]);
    m.applyBatch('proj', 8, 'orders', [up('o6', { v: 6 })]);
    // All four buckets have some checkpoint now; min is the slowest.
    const min = Math.min(...[0, 1, 2, 3].map((b) => m.bucketCheckpoint('proj', b)));
    expect(m.checkpoint('proj', 4)).toBe(min);
  });

  it('field router co-locates docs sharing the routing key', () => {
    const m2 = new ShardedReadModel();
    m2.registerModel(
      { name: 'lines', buckets: 8, indexes: ['orderId'] },
      fieldRouter(8, 'orderId')
    );
    for (let i = 0; i < 5; i++) {
      m2.upsert('lines', `l${i}`, { orderId: 'order-9', sku: `s${i}` });
    }
    // All five lines land in ONE bucket — the bucket of 'order-9'.
    const dist = m2.distribution('lines');
    const occupied = dist.filter((n) => n > 0);
    expect(occupied).toEqual([5]);
    // And a routed lookup on the routing field hits exactly that bucket.
    const found = m2.findByRouted('lines', 'orderId', 'order-9');
    expect(found).toHaveLength(5);
  });

  it('rescale rehashes docs and keeps checkpoints at the old min', () => {
    for (let i = 0; i < 12; i++) m.upsert('orders', `o${i}`, { customerId: `c${i % 3}` });
    m.applyBatch('proj', 42, 'orders', [up('x', { v: 1 })]);
    for (let b = 0; b < 4; b++) m.setBucketCheckpoint('proj', b, 42);

    const counts = m.rescale('orders', 8);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(13); // 12 + the 'x' doc
    expect(m.count('orders')).toBe(13);
    // Every doc still readable, indexes rebuilt.
    for (let i = 0; i < 12; i++) expect(m.get('orders', `o${i}`)).toBeDefined();
    expect(m.findBy('orders', 'customerId', 'c0')).toHaveLength(4);
    // Checkpoints re-baselined to the old min for every new bucket.
    for (let b = 0; b < 8; b++) expect(m.bucketCheckpoint('proj', b)).toBe(42);
  });

  it('rescale changes bucket assignments for some docs', () => {
    for (let i = 0; i < 30; i++) m.upsert('orders', `o${i}`, { v: i });
    const before = new Map(
      Array.from({ length: 30 }, (_, i) => [`o${i}`, m.bucketOf('orders', `o${i}`)])
    );
    m.rescale('orders', 7);
    let moved = 0;
    for (const [id, b] of before) {
      if (m.bucketOf('orders', id) !== b) moved++;
    }
    expect(moved).toBeGreaterThan(0); // 4→7 must move most docs
  });

  it('hashRouter is uniform enough across buckets', () => {
    const r = hashRouter(8);
    const counts = new Array(8).fill(0);
    for (let i = 0; i < 4000; i++) counts[r(`k${i}`)]++;
    for (const c of counts) {
      expect(c).toBeGreaterThan(200); // ~500 expected, allow wide variance
      expect(c).toBeLessThan(800);
    }
  });

  it('rejects bad registrations and unknown models', () => {
    expect(() => m.registerModel({ name: 'bad', buckets: 0 })).toThrow(ShardedModelError);
    expect(() => m.get('nope', 'x')).not.toThrow(); // get is lenient
    expect(() => m.findBy('orders', 'notIndexed', 'v')).toThrow(ShardedModelError);
    expect(m.get('nope', 'x')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// ReadModelReplication
// ---------------------------------------------------------------------

describe('ReadModelReplication', () => {
  let clock: ManualClock;
  let journal: ReplicationJournal;
  let primary: ReadModelStore;
  let replica: ReplicaReadStore;
  let repl: ReadModelReplication;

  beforeEach(() => {
    clock = new ManualClock(1_000_000);
    journal = new ReplicationJournal({ clock });
    primary = new ReadModelStore();
    primary.registerModel({ name: 'orders', indexes: ['customerId'] });
    replica = new ReplicaReadStore(clock);
    replica.registerModel({ name: 'orders', indexes: ['customerId'] });
    repl = new ReadModelReplication(journal, primary, replica, { clock });
  });

  function emit(position: number, ops: ProjectionOp[]): void {
    primary.applyBatch('orders-proj', position, 'orders', ops);
    journal.append('orders-proj', 'orders', position, ops);
  }

  it('ships ops so the replica mirrors the primary', () => {
    emit(0, [up('o1', { customerId: 'c1', total: 10 })]);
    emit(1, [up('o2', { customerId: 'c1', total: 20 })]);
    expect(repl.syncOnce()).toBe(2);
    expect(replica.count('orders')).toBe(2);
    expect(replica.get('orders', 'o1')?.total).toBe(10);
    expect(replica.findBy('orders', 'customerId', 'c1')).toHaveLength(2);
    // Replica checkpoint tracks the domain position, not the seq.
    expect(replica.checkpoint('orders-proj')).toBe(1);
  });

  it('staleness reports seq lag and position lag separately', () => {
    emit(0, [up('o1', { v: 1 })]);
    emit(5, [up('o2', { v: 2 })]);
    emit(9, [up('o3', { v: 3 })]);
    const st = repl.staleness();
    expect(st.seqLag).toBe(3);
    // primary cp 9 - replica cp -1 = 10 positions behind.
    expect(st.positionLag.get('orders-proj')).toBe(10);
    expect(st.caughtUp).toBe(false);
    repl.syncOnce();
    const st2 = repl.staleness();
    expect(st2.seqLag).toBe(0);
    expect(st2.positionLag.get('orders-proj')).toBe(0);
    expect(st2.caughtUp).toBe(true);
  });

  it('is idempotent under re-delivery', () => {
    emit(0, [up('o1', { v: 1 })]);
    repl.syncOnce();
    // Re-deliver the same entries — skipped, not double-applied.
    const { entries } = journal.pull(0);
    const r = replica.apply(entries);
    expect(r.applied).toBe(0);
    expect(r.skipped).toBe(1);
    expect(replica.count('orders')).toBe(1);
  });

  it('rejects a gap (missing journal seq)', () => {
    emit(0, [up('o1', {})]);
    emit(1, [up('o2', {})]);
    const { entries } = journal.pull(0);
    // Apply seq 1 without seq 0 → gap error.
    expect(() => replica.apply([entries[1]])).toThrow(ReplicationGapError);
  });

  it('journal retention drops the oldest entries and reports the gap', () => {
    const small = new ReplicationJournal({ capacity: 3, clock });
    for (let i = 0; i < 5; i++) small.append('p', 'm', i, [up(`d${i}`, {})]);
    expect(small.baseSeq()).toBe(2); // seqs 2,3,4 retained
    expect(() => small.pull(0)).toThrow(ReplicationGapError);
    const { entries } = small.pull(2);
    expect(entries.map((e) => e.seq)).toEqual([2, 3, 4]);
  });

  it('measures idle time via the injected clock', () => {
    emit(0, [up('o1', {})]);
    expect(repl.staleness().idleMs).toBe(-1);
    repl.syncOnce();
    clock.advance(2500);
    expect(repl.staleness().idleMs).toBe(2500);
  });

  it('patch and delete ops replicate faithfully', () => {
    emit(0, [up('o1', { total: 10, status: 'open' })]);
    emit(1, [{ kind: 'patch', id: 'o1', patch: { status: 'paid' } }]);
    emit(2, [up('o2', { total: 5 })]);
    emit(3, [{ kind: 'delete', id: 'o2' }]);
    repl.syncOnce();
    expect(replica.get('orders', 'o1')).toEqual({ total: 10, status: 'paid' });
    expect(replica.get('orders', 'o2')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// QueryCache
// ---------------------------------------------------------------------

describe('QueryCache', () => {
  let clock: ManualClock;
  let cache: QueryCache;
  let store: ReadModelStore;

  beforeEach(() => {
    clock = new ManualClock(0);
    cache = new QueryCache({ capacity: 4, clock });
    store = new ReadModelStore();
    store.registerModel({ name: 'orders' });
    cache.registerQueryType('GetOrder', { ttlMs: 30_000, models: ['orders'] });
    cache.registerQueryType('GetReport', { ttlMs: 3_600_000, models: [] });
    cache.bindModel('orders', () => store.checkpoint('orders-proj'));
  });

  it('hits until TTL expires', () => {
    cache.store('GetReport', 'monthly', { rows: 5 });
    expect(cache.lookup('GetReport', 'monthly').outcome).toBe('hit');
    clock.advance(3_599_999);
    expect(cache.lookup('GetReport', 'monthly').outcome).toBe('hit');
    clock.advance(2);
    expect(cache.lookup('GetReport', 'monthly').outcome).toBe('expired');
  });

  it('goes stale when the projection checkpoint moves, even within TTL', () => {
    store.applyBatch('orders-proj', 0, 'orders', [up('o1', { v: 1 })]);
    cache.store('GetOrder', 'o1', { v: 1 });
    expect(cache.lookup('GetOrder', 'o1').outcome).toBe('hit');
    // Projection applies another event → checkpoint moves → entry stale.
    store.applyBatch('orders-proj', 1, 'orders', [up('o1', { v: 2 })]);
    expect(cache.lookup('GetOrder', 'o1').outcome).toBe('stale-checkpoint');
  });

  it('notifyUpdate invalidates lazily via generation', () => {
    cache.store('GetOrder', 'o1', { v: 1 });
    cache.store('GetOrder', 'o2', { v: 2 });
    cache.notifyUpdate('orders');
    expect(cache.lookup('GetOrder', 'o1').outcome).toBe('stale-generation');
    expect(cache.lookup('GetOrder', 'o2').outcome).toBe('stale-generation');
    // A query type not bound to 'orders' is untouched.
    cache.store('GetReport', 'r', 42);
    cache.notifyUpdate('orders');
    expect(cache.lookup('GetReport', 'r').outcome).toBe('hit');
  });

  it('evicts LRU when over capacity', () => {
    cache.store('GetReport', 'a', 1);
    cache.store('GetReport', 'b', 2);
    cache.store('GetReport', 'c', 3);
    cache.store('GetReport', 'd', 4);
    // Touch 'a' so it's MRU — 'b' is now LRU.
    expect(cache.lookup('GetReport', 'a').outcome).toBe('hit');
    cache.store('GetReport', 'e', 5);
    expect(cache.size).toBe(4);
    expect(cache.lookup('GetReport', 'b').outcome).toBe('miss');
    expect(cache.lookup('GetReport', 'a').outcome).toBe('hit');
  });

  it('getOrCompute caches the computed value', () => {
    let calls = 0;
    const compute = () => {
      calls++;
      return { expensive: calls };
    };
    const r1 = cache.getOrCompute('GetReport', 'x', compute);
    expect(r1.outcome).toBe('miss');
    expect(r1.value).toEqual({ expensive: 1 });
    const r2 = cache.getOrCompute('GetReport', 'x', compute);
    expect(r2.outcome).toBe('hit');
    expect(r2.value).toEqual({ expensive: 1 }); // not recomputed
    expect(calls).toBe(1);
  });

  it('invalidateModel eagerly drops derived entries', () => {
    cache.store('GetOrder', 'o1', 1);
    cache.store('GetOrder', 'o2', 2);
    cache.store('GetReport', 'r', 3);
    const n = cache.invalidateModel('orders');
    expect(n).toBe(2);
    expect(cache.lookup('GetReport', 'r').outcome).toBe('hit');
  });

  it('tracks hit-rate stats', () => {
    cache.store('GetReport', 'a', 1);
    cache.lookup('GetReport', 'a'); // hit
    cache.lookup('GetReport', 'b'); // miss
    const s = cache.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.hitRate).toBeCloseTo(0.5);
  });

  it('rejects non-positive TTL', () => {
    expect(() => cache.registerQueryType('Bad', { ttlMs: 0, models: [] })).toThrow();
  });
});

// ---------------------------------------------------------------------
// ConsistencySla
// ---------------------------------------------------------------------

describe('ConsistencySla', () => {
  let clock: ManualClock;
  let sla: ConsistencySla;

  beforeEach(() => {
    clock = new ManualClock(1_000_000);
    sla = new ConsistencySla({ clock });
    sla.register('orders-proj', { targetMs: 500, allowedBreachFraction: 0.1 });
  });

  it('meets SLO when all samples are under target', () => {
    for (let i = 0; i < 10; i++) sla.observe('orders-proj', clock.nowMs() - 100);
    const r = sla.report('orders-proj');
    expect(r.sloMet).toBe(true);
    expect(r.withinFraction).toBe(1);
    expect(r.burning).toBe(false);
    expect(r.p99Ms).toBeLessThanOrEqual(500);
  });

  it('burns when breach fraction exceeds the budget', () => {
    // 8 fast + 4 slow → 33% breach > 10% allowed.
    for (let i = 0; i < 8; i++) sla.observe('orders-proj', clock.nowMs() - 100);
    for (let i = 0; i < 4; i++) sla.observe('orders-proj', clock.nowMs() - 5000);
    const r = sla.report('orders-proj');
    expect(r.withinFraction).toBeCloseTo(8 / 12);
    expect(r.burning).toBe(true);
    expect(r.sloMet).toBe(false);
    expect(sla.burning()).toEqual(['orders-proj']);
    expect(sla.allMet()).toBe(false);
  });

  it('computes percentiles over the window', () => {
    // Samples: 100, 200, ..., 1000 (10 samples).
    for (let i = 1; i <= 10; i++) sla.observe('orders-proj', clock.nowMs() - i * 100);
    const r = sla.report('orders-proj');
    expect(r.p50Ms).toBe(500);
    expect(r.p99Ms).toBe(1000);
    expect(r.maxMs).toBe(1000);
  });

  it('clamps negative staleness (clock skew) to zero', () => {
    sla.observe('orders-proj', clock.nowMs() + 5000); // "future" event
    const r = sla.report('orders-proj');
    expect(r.maxMs).toBe(0);
    expect(r.withinFraction).toBe(1);
  });

  it('EWMA trends toward recent samples', () => {
    sla.register('trend', { targetMs: 100 });
    for (let i = 0; i < 20; i++) sla.observe('trend', clock.nowMs() - 10); // old: 10ms
    const before = sla.ewma('trend', 0.5);
    for (let i = 0; i < 20; i++) sla.observe('trend', clock.nowMs() - 90); // recent: 90ms
    const after = sla.ewma('trend', 0.5);
    expect(before).toBeLessThan(20);
    expect(after).toBeGreaterThan(80); // dominated by recent 90ms samples
  });

  it('observeBatch samples every event timestamp', () => {
    const tss = [clock.nowMs() - 100, clock.nowMs() - 200, clock.nowMs() - 300];
    sla.observeBatch('orders-proj', tss);
    const r = sla.report('orders-proj');
    expect(r.samples).toBe(3);
    expect(r.meanMs).toBe(200);
  });

  it('window is bounded — old samples age out', () => {
    sla.register('bounded', { targetMs: 50, windowSize: 8 });
    for (let i = 0; i < 8; i++) sla.observe('bounded', clock.nowMs() - 1000); // all breach
    expect(sla.report('bounded').sloMet).toBe(false);
    for (let i = 0; i < 8; i++) sla.observe('bounded', clock.nowMs() - 10); // flush window
    const r = sla.report('bounded');
    expect(r.samples).toBe(8);
    expect(r.sloMet).toBe(true);
  });

  it('reset clears accumulated samples', () => {
    sla.observe('orders-proj', clock.nowMs() - 9000);
    sla.reset('orders-proj');
    const r = sla.report('orders-proj');
    expect(r.samples).toBe(0);
    expect(r.sloMet).toBe(true);
  });
});

// ---------------------------------------------------------------------
// ReplicaQueryRouter
// ---------------------------------------------------------------------

describe('ReplicaQueryRouter', () => {
  let clock: ManualClock;
  let journal: ReplicationJournal;
  let primary: ReadModelStore;
  let replica: ReplicaReadStore;
  let repl: ReadModelReplication;
  let router: ReplicaQueryRouter;

  beforeEach(() => {
    clock = new ManualClock(0);
    journal = new ReplicationJournal({ clock });
    primary = new ReadModelStore();
    primary.registerModel({ name: 'orders' });
    replica = new ReplicaReadStore(clock);
    replica.registerModel({ name: 'orders' });
    repl = new ReadModelReplication(journal, primary, replica, { clock });
    router = new ReplicaQueryRouter(primary, clock);
    router.addReplica('r1', repl);
  });

  function emit(position: number, ops: ProjectionOp[]): void {
    primary.applyBatch('orders-proj', position, 'orders', ops);
    journal.append('orders-proj', 'orders', position, ops);
  }

  it('strong reads always land on primary', () => {
    emit(0, [up('o1', {})]);
    expect(router.route('orders-proj', { kind: 'strong' }).target).toBe('primary');
  });

  it('bounded-events accepts a replica within the lag budget', () => {
    emit(0, [up('o1', {})]);
    repl.syncOnce();
    const ok = router.route('orders-proj', { kind: 'bounded-events', maxEventsBehind: 0 });
    expect(ok.target).toBe('r1');
    // Primary moves ahead by 5.
    for (let i = 1; i <= 5; i++) emit(i, [up(`o${i}`, {})]);
    const strict = router.route('orders-proj', { kind: 'bounded-events', maxEventsBehind: 2 });
    expect(strict.target).toBe('primary');
    const loose = router.route('orders-proj', { kind: 'bounded-events', maxEventsBehind: 10 });
    expect(loose.target).toBe('r1');
  });

  it('bounded-ms uses replica idle time, not position lag', () => {
    emit(0, [up('o1', {})]);
    repl.syncOnce();
    const fresh = router.route('orders-proj', { kind: 'bounded-ms', maxIdleMs: 1000 });
    expect(fresh.target).toBe('r1');
    clock.advance(5000);
    const stale = router.route('orders-proj', { kind: 'bounded-ms', maxIdleMs: 1000 });
    expect(stale.target).toBe('primary');
  });

  it('read-your-writes pins the session floor', () => {
    emit(0, [up('o1', {})]);
    repl.syncOnce();
    // Session writes at position 3 (primary only).
    emit(1, [up('o2', {})]);
    emit(2, [up('o3', {})]);
    emit(3, [up('o4', {})]);
    router.pinWrite('orders-proj', 3);
    const d1 = router.route('orders-proj', { kind: 'read-your-writes' });
    expect(d1.target).toBe('primary'); // replica checkpoint 0 < floor 3
    repl.syncOnce();
    const d2 = router.route('orders-proj', { kind: 'read-your-writes' });
    expect(d2.target).toBe('r1');
  });

  it('storeFor returns a working store for the chosen copy', () => {
    emit(0, [up('o1', { total: 99 })]);
    repl.syncOnce();
    const { store: s, decision } = router.storeFor('orders-proj', { kind: 'any' });
    expect(decision.target).toBe('r1');
    expect(s.get('orders', 'o1')?.total).toBe(99);
  });

  it('round-robins eligible replicas', () => {
    const r2 = new ReplicaReadStore(clock);
    r2.registerModel({ name: 'orders' });
    const repl2 = new ReadModelReplication(journal, primary, r2, { clock });
    router.addReplica('r2', repl2);
    emit(0, [up('o1', {})]);
    repl.syncOnce();
    repl2.syncOnce();
    const picks = new Set<string>();
    for (let i = 0; i < 6; i++) {
      picks.add(router.route('orders-proj', { kind: 'any' }).target);
    }
    expect(picks).toEqual(new Set(['r1', 'r2']));
  });
});

// ---------------------------------------------------------------------
// Integration: journal → cache invalidation → replica serve
// ---------------------------------------------------------------------

describe('read-side lifecycle', () => {
  it('projection update flows: journal → replica + cache invalidation', () => {
    const clock = new ManualClock(0);
    const journal = new ReplicationJournal({ clock });
    const primary = new ReadModelStore();
    primary.registerModel({ name: 'orders' });
    const replica = new ReplicaReadStore(clock);
    replica.registerModel({ name: 'orders' });
    const repl = new ReadModelReplication(journal, primary, replica, { clock });
    const cache = new QueryCache({ clock });
    cache.registerQueryType('GetOrder', { ttlMs: 60_000, models: ['orders'] });
    cache.bindModel('orders', () => primary.checkpoint('p'));

    const emit = (pos: number, ops: ProjectionOp[]) => {
      primary.applyBatch('p', pos, 'orders', ops);
      journal.append('p', 'orders', pos, ops);
      cache.notifyUpdate('orders');
    };

    emit(0, [up('o1', { total: 10 })]);
    // Query caches the result.
    const r1 = cache.getOrCompute('GetOrder', 'o1', () => primary.get('orders', 'o1'));
    expect(r1.outcome).toBe('miss');
    expect(r1.value?.total).toBe(10);
    // Update lands → cache invalidates, replica catches up.
    emit(1, [{ kind: 'patch', id: 'o1', patch: { total: 42 } }]);
    expect(cache.lookup('GetOrder', 'o1').outcome).not.toBe('hit');
    repl.syncOnce();
    expect(replica.get('orders', 'o1')?.total).toBe(42);
    // Re-cache serves the fresh value.
    const r2 = cache.getOrCompute('GetOrder', 'o1', () => primary.get('orders', 'o1'));
    expect(r2.value?.total).toBe(42);
  });
});
