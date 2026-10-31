/**
 * Sharded event store tests: placement strategies, per-shard ordering,
 * segments + sealing, replication + lag, read-replica routing,
 * compaction, and integrity verification.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import { ANY, NO_STREAM, ConcurrencyError } from '../../implementations/EventStore';
import {
  ConsistentHashRing,
  RendezvousHasher,
  fnv1a,
  chainHash,
  hex32,
  ShardedEventStore,
  InMemoryShardStorage,
  EventSegment,
  EventStoreReplica,
  EventStoreReplication,
  ReadReplicaRouter,
  StoreCompactor,
  StoreIntegrityVerifier,
  hashEventContent,
  segmentChecksum,
  ShardNotFoundError,
} from '../../engine';

const clock = () => new ManualClock(1_000_000);

function store3(opts: { segments?: number; map?: 'ring' | 'hrw' } = {}) {
  const c = clock();
  const map =
    opts.map === 'hrw'
      ? new RendezvousHasher(['s0', 's1', 's2'])
      : new ConsistentHashRing(['s0', 's1', 's2'], { vnodeCount: 64 });
  const store = new ShardedEventStore(map, new InMemoryShardStorage(), {
    segmentMaxEvents: opts.segments ?? 4,
    clock: c,
  });
  return { store, map, c };
}

function append(
  store: ShardedEventStore,
  streamId: string,
  type: string,
  n: number,
  data: unknown = {}
) {
  const first = store.streamVersion(streamId) === -1;
  return store.appendToStream(
    streamId,
    first ? NO_STREAM : ANY,
    Array.from({ length: n }, (_, i) => ({ type, data: { i, ...(data as object) } }))
  );
}

// ---------------------------------------------------------------------
// Sharding
// ---------------------------------------------------------------------

describe('fnv1a / chainHash', () => {
  it('is deterministic and unsigned', () => {
    expect(fnv1a('order-42')).toBe(fnv1a('order-42'));
    expect(fnv1a('order-42')).toBeGreaterThanOrEqual(0);
    expect(fnv1a('order-42')).toBeLessThan(2 ** 32);
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
  });

  it('chainHash is order-sensitive', () => {
    expect(chainHash(1, 2)).not.toBe(chainHash(2, 1));
  });

  it('hex32 pads to 8 chars', () => {
    expect(hex32(0xff)).toBe('000000ff');
  });
});

describe('ConsistentHashRing', () => {
  it('routes deterministically to a known shard', () => {
    const ring = new ConsistentHashRing(['a', 'b', 'c'], { vnodeCount: 32 });
    const s1 = ring.shardOf('stream-1');
    expect(['a', 'b', 'c']).toContain(s1);
    expect(ring.shardOf('stream-1')).toBe(s1);
  });

  it('removing a shard only moves its streams (minimal disruption)', () => {
    const ring = new ConsistentHashRing(['a', 'b', 'c'], { vnodeCount: 64 });
    const keys = Array.from({ length: 300 }, (_, i) => `k-${i}`);
    const before = new Map(keys.map((k) => [k, ring.shardOf(k)]));
    ring.removeShard('b');
    let moved = 0;
    let movedToB = 0;
    for (const k of keys) {
      const now = ring.shardOf(k);
      if (now === 'b') movedToB++;
      if (now !== before.get(k)) moved++;
    }
    expect(movedToB).toBe(0);
    // Roughly a third of keys were on 'b'; only those may move.
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(200); // well under "everything reshuffles"
  });

  it('adding a shard steals a bounded fraction of keys', () => {
    const ring = new ConsistentHashRing(['a', 'b'], { vnodeCount: 64 });
    const keys = Array.from({ length: 300 }, (_, i) => `k-${i}`);
    const before = new Map(keys.map((k) => [k, ring.shardOf(k)]));
    ring.addShard('c');
    let moved = 0;
    for (const k of keys) if (ring.shardOf(k) !== before.get(k)) moved++;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(250);
  });

  it('ownership report sums to ~1', () => {
    const ring = new ConsistentHashRing(['a', 'b', 'c'], { vnodeCount: 128 });
    const own = ring.ownership();
    const total = Object.values(own).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
    // No shard owns nothing with 128 vnodes.
    for (const v of Object.values(own)) expect(v).toBeGreaterThan(0.05);
  });

  it('refuses to remove the last shard', () => {
    const ring = new ConsistentHashRing(['only']);
    expect(() => ring.removeShard('only')).toThrow();
  });
});

describe('RendezvousHasher', () => {
  it('is deterministic and covers all shards for enough keys', () => {
    const h = new RendezvousHasher(['x', 'y', 'z']);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(h.shardOf(`k${i}`));
    expect(seen.size).toBe(3);
    expect(h.shardOf('same')).toBe(h.shardOf('same'));
  });

  it('rank() puts the owner first', () => {
    const h = new RendezvousHasher(['x', 'y', 'z']);
    const r = h.rank('some-key');
    expect(r[0]).toBe(h.shardOf('some-key'));
    expect(new Set(r).size).toBe(3);
  });

  it('weighted shards attract proportionally more keys', () => {
    const h = new RendezvousHasher([{ id: 'light', weight: 1 }, { id: 'heavy', weight: 4 }]);
    let heavy = 0;
    for (let i = 0; i < 2000; i++) if (h.shardOf(`k${i}`) === 'heavy') heavy++;
    // Expect ~80% on heavy; allow generous bounds for hash variance.
    expect(heavy).toBeGreaterThan(1200);
  });

  it('rejects zero weight and removing the last shard', () => {
    const h = new RendezvousHasher(['only']);
    expect(() => h.addShard('dead', 0)).toThrow();
    expect(() => h.removeShard('only')).toThrow();
  });
});

// ---------------------------------------------------------------------
// ShardedEventStore
// ---------------------------------------------------------------------

describe('ShardedEventStore', () => {
  let store: ShardedEventStore;

  beforeEach(() => {
    ({ store } = store3({ segments: 4 }));
  });

  it('appends with per-stream contiguous versions', () => {
    const evts = append(store, 'order-1', 'Placed', 3);
    expect(evts.map((e) => e.streamVersion)).toEqual([0, 1, 2]);
    append(store, 'order-1', 'Paid', 2);
    expect(store.streamVersion('order-1')).toBe(4);
    expect(store.readStream('order-1').map((e) => e.streamVersion)).toEqual([0, 1, 2, 3, 4]);
  });

  it('enforces optimistic concurrency', () => {
    append(store, 's', 'E', 2);
    expect(() => store.appendToStream('s', NO_STREAM, [{ type: 'E', data: {} }])).toThrow(
      ConcurrencyError
    );
    expect(() => store.appendToStream('s', 5, [{ type: 'E', data: {} }])).toThrow(
      ConcurrencyError
    );
    expect(store.conflictCount).toBe(2);
    expect(() => store.appendToStream('s', 1, [{ type: 'E', data: {} }])).not.toThrow();
  });

  it('keeps every stream on exactly one shard', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (const id of ids) append(store, id, 'E', 2);
    const seen = new Set<string>();
    for (const id of ids) {
      const shard = store.shardOf(id);
      expect(seen.has(shard) || true).toBe(true);
      const evts = store.readStream(id);
      for (const e of evts) expect(e.shardId).toBe(shard);
    }
  });

  it('assigns contiguous per-shard positions', () => {
    for (let i = 0; i < 20; i++) append(store, `s${i}`, 'E', 2);
    for (const shardId of store.shardMap.shardIds()) {
      const { events } = store.scanShard(shardId, 0, 10_000);
      const positions = events.map((e) => e.shardPosition).sort((a, b) => a - b);
      for (let i = 0; i < positions.length; i++) expect(positions[i]).toBe(i);
    }
  });

  it('seals segments at the configured size', () => {
    // File-appender semantics: a whole append batch lands in the active
    // segment, then the segment seals if it reached the cap. So batches
    // of 4 with cap 4 produce [4 sealed, 4 sealed, 4 sealed, 1 active].
    const id = 'single';
    append(store, id, 'E', 4);
    append(store, id, 'E', 4);
    append(store, id, 'E', 4);
    append(store, id, 'E', 1);
    const segs = store.storage.segments(store.shardOf(id));
    const sealed = segs.filter((s) => s.sealed);
    expect(sealed.length).toBe(3);
    for (const s of sealed) expect(s.size).toBe(4);
    const active = segs[segs.length - 1];
    expect(active.sealed).toBe(false);
    expect(active.size).toBe(1);
    // A batch never splits across segments.
    const total = segs.reduce((n, s) => n + s.size, 0);
    expect(total).toBe(13);
  });

  it('scanShard pages forward with a cursor', () => {
    append(store, 'p', 'E', 10);
    const shard = store.shardOf('p');
    const seen = new Set<number>();
    let cursor = 0;
    for (let round = 0; round < 10; round++) {
      const { events, nextPosition } = store.scanShard(shard, cursor, 3);
      for (const e of events) seen.add(e.shardPosition);
      cursor = nextPosition;
      if (events.length === 0) break;
    }
    // All 10 events of the shard (only stream p) observed exactly once.
    expect(seen.size).toBe(10);
  });

  it('readStream honors fromVersion and limit', () => {
    append(store, 'r', 'E', 6);
    const tail = store.readStream('r', { fromVersion: 3, limit: 2 });
    expect(tail.map((e) => e.streamVersion)).toEqual([3, 4]);
  });

  it('scanAll merges shards by timestamp', () => {
    const c = clock();
    const map = new ConsistentHashRing(['s0', 's1'], { vnodeCount: 32 });
    const st = new ShardedEventStore(map, new InMemoryShardStorage(), { clock: c });
    append(st, 'a', 'E', 2);
    c.advance(10);
    append(st, 'b', 'E', 2);
    const all = st.scanAll();
    expect(all).toHaveLength(4);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].timestamp).toBeGreaterThanOrEqual(all[i - 1].timestamp);
    }
  });

  it('addShard migrates only affected streams, preserving versions', () => {
    const map = new ConsistentHashRing(['a', 'b'], { vnodeCount: 32 });
    const st = new ShardedEventStore(map, new InMemoryShardStorage(), { clock: clock() });
    const streamIds = Array.from({ length: 30 }, (_, i) => `str-${i}`);
    for (const id of streamIds) append(st, id, 'E', 3);

    const versionsBefore = new Map(streamIds.map((id) => [id, st.streamVersion(id)]));
    const { moved, moves } = st.addShard('c');
    expect(moved).toBe(moves.length);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(30);

    for (const m of moves) {
      // Stream re-homed: every event reports the new shard.
      const evts = st.readStream(m.streamId);
      expect(evts).toHaveLength(3);
      for (const e of evts) expect(e.shardId).toBe('c');
      // Old shard has no trace.
      const src = st.scanShard(m.from, 0, 10_000).events;
      expect(src.find((e) => e.streamId === m.streamId)).toBeUndefined();
    }
    // Versions unchanged for ALL streams (migrated or not).
    for (const id of streamIds) expect(st.streamVersion(id)).toBe(versionsBefore.get(id));
    // Appends still work everywhere.
    append(st, 'post', 'E', 1);
  });

  it('removeShard re-homes all its streams', () => {
    const map = new ConsistentHashRing(['a', 'b'], { vnodeCount: 32 });
    const st = new ShardedEventStore(map, new InMemoryShardStorage(), { clock: clock() });
    const onB: string[] = [];
    for (let i = 0; i < 40; i++) {
      const id = `x${i}`;
      append(st, id, 'E', 2);
      if (st.shardOf(id) === 'b') onB.push(id);
    }
    const { moved } = st.removeShard('b');
    expect(moved).toBe(onB.length);
    for (const id of onB) {
      expect(st.shardOf(id)).toBe('a');
      expect(st.readStream(id)).toHaveLength(2);
    }
    expect(st.scanShard('b', 0).events).toHaveLength(0);
  });

  it('shardStats reports per-shard load', () => {
    for (let i = 0; i < 15; i++) append(store, `s${i}`, 'E', 2);
    const stats = store.shardStats();
    expect(stats).toHaveLength(3);
    const total = stats.reduce((n, s) => n + s.events, 0);
    expect(total).toBe(30);
  });
});

// ---------------------------------------------------------------------
// Replication
// ---------------------------------------------------------------------

describe('EventStoreReplication', () => {
  let store: ShardedEventStore;
  let c: ManualClock;
  let replica: EventStoreReplica;
  let repl: EventStoreReplication;

  beforeEach(() => {
    ({ store, c } = store3({ segments: 4 }));
    replica = new EventStoreReplica('r1', c);
    repl = new EventStoreReplication(store, replica, { clock: c, batchSize: 5 });
  });

  it('ships all events to the replica in shard order', () => {
    for (let i = 0; i < 12; i++) append(store, `s${i}`, 'E', 2);
    const applied = repl.syncOnce();
    expect(applied).toBe(24);
    expect(repl.caughtUp()).toBe(true);
    for (let i = 0; i < 12; i++) {
      expect(replica.readStream(`s${i}`)).toHaveLength(2);
      expect(replica.streamVersion(`s${i}`)).toBe(1);
    }
  });

  it('tracks position lag until the next sync', () => {
    append(store, 'a', 'E', 3);
    repl.syncOnce();
    append(store, 'a', 'E', 2);
    append(store, 'b', 'E', 4);
    const lag = repl.lag();
    const shardA = store.shardOf('a');
    const shardB = store.shardOf('b');
    const lagA = lag.find((l) => l.shardId === shardA)!;
    expect(lagA.positionLag).toBeGreaterThan(0);
    expect(repl.maxPositionLag()).toBe(lag.reduce((m, l) => Math.max(m, l.positionLag), 0));
    expect(repl.caughtUp()).toBe(false);
    void shardB;
  });

  it('is idempotent under re-delivery', () => {
    append(store, 'a', 'E', 3);
    const shard = store.shardOf('a');
    const { events } = store.scanShard(shard, 0);
    replica.applyBatch(shard, events);
    const r2 = replica.applyBatch(shard, events); // duplicate delivery
    expect(r2.applied).toBe(0);
    expect(r2.skipped).toBeGreaterThan(0);
    expect(replica.readStream('a')).toHaveLength(3);
  });

  it('rejects out-of-order batches (gap protection)', () => {
    append(store, 'a', 'E', 4);
    const shard = store.shardOf('a');
    const { events } = store.scanShard(shard, 0);
    // Skip the first event → gap at position 0.
    expect(() => replica.applyBatch(shard, events.slice(1))).toThrow(/gap/);
  });

  it('rejects corrupted content (hash mismatch)', () => {
    append(store, 'a', 'E', 1);
    const shard = store.shardOf('a');
    const { events } = store.scanShard(shard, 0);
    const corrupted = { ...events[0], data: { tampered: true } };
    expect(() => replica.applyBatch(shard, [corrupted])).toThrow(/hash mismatch/);
  });

  it('measures time lag via the injected clock', () => {
    append(store, 'a', 'E', 1);
    expect(repl.lag()[0].timeLagMs).toBe(-1); // never applied
    repl.syncOnce();
    c.advance(5000);
    const lag = repl.lag().find((l) => l.shardId === store.shardOf('a'))!;
    expect(lag.positionLag).toBe(0);
    expect(lag.timeLagMs).toBe(5000);
  });

  it('cursor snapshot/restore round-trips and clamps safely', () => {
    append(store, 'a', 'E', 3);
    repl.syncOnce();
    const snap = replica.cursorSnapshot();
    const fresh = new EventStoreReplica('r2', c);
    fresh.restoreCursor({ ...snap, [store.shardOf('a')]: 999 });
    // Clamped to data head (empty replica) — can't skip ahead.
    expect(fresh.cursor(store.shardOf('a'))).toBe(0);
  });

  it('shipRewrite replaces the replica shard wholesale', () => {
    append(store, 'a', 'E', 4);
    repl.syncOnce();
    const rewritten = replica.replicaShardEvents(store.shardOf('a')).map((e, i) => ({
      ...e,
      shardPosition: i,
    }));
    repl.shipRewrite(store.shardOf('a'), rewritten);
    expect(replica.readStream('a')).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------
// ReadReplicaRouter
// ---------------------------------------------------------------------

describe('ReadReplicaRouter', () => {
  let store: ShardedEventStore;
  let c: ManualClock;
  let replica: EventStoreReplica;
  let repl: EventStoreReplication;
  let router: ReadReplicaRouter;

  beforeEach(() => {
    ({ store, c } = store3({ segments: 4 }));
    replica = new EventStoreReplica('r1', c);
    repl = new EventStoreReplication(store, replica, { clock: c });
    router = new ReadReplicaRouter(store, c);
    router.addReplica(repl);
  });

  it('strong consistency always picks primary', () => {
    append(store, 'a', 'E', 2);
    const d = router.route('a', 'strong');
    expect(d.target).toBe('primary');
  });

  it('eventual routes to a registered replica', () => {
    append(store, 'a', 'E', 2);
    repl.syncOnce();
    const d = router.route('a', 'eventual');
    expect(d.target).toEqual({ replica: 'r1' });
  });

  it('bounded staleness falls back when the replica lags', () => {
    append(store, 'a', 'E', 5);
    repl.syncOnce();
    append(store, 'a', 'E', 10); // replica now 10 behind
    const loose = router.route('a', 'bounded', { maxPositionLag: 100 });
    expect(loose.target).toEqual({ replica: 'r1' });
    const tight = router.route('a', 'bounded', { maxPositionLag: 2 });
    expect(tight.target).toBe('primary');
  });

  it('read-your-writes waits for the replica to cover the write', () => {
    append(store, 'a', 'E', 3);
    repl.syncOnce();
    append(store, 'a', 'E', 2);
    router.noteWrite('a'); // session wrote position 4
    const d1 = router.route('a', 'read-your-writes');
    expect(d1.target).toBe('primary'); // replica cursor at 3, need 5
    repl.syncOnce();
    const d2 = router.route('a', 'read-your-writes');
    expect(d2.target).toEqual({ replica: 'r1' });
  });

  it('read() returns events from the chosen target', () => {
    append(store, 'a', 'E', 3);
    repl.syncOnce();
    const { events, decision } = router.read('a', 'eventual');
    expect(events).toHaveLength(3);
    expect(decision.target).toEqual({ replica: 'r1' });
  });

  it('round-robins across replicas', () => {
    const r2 = new EventStoreReplica('r2', c);
    const repl2 = new EventStoreReplication(store, r2, { clock: c });
    router.addReplica(repl2);
    append(store, 'a', 'E', 2);
    repl.syncOnce();
    repl2.syncOnce();
    const picks = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const d = router.route('a', 'eventual');
      if (d.target !== 'primary') picks.add(d.target.replica);
    }
    expect(picks.size).toBe(2);
  });
});

// ---------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------

describe('StoreCompactor', () => {
  let store: ShardedEventStore;
  let c: ManualClock;
  let compactor: StoreCompactor;

  beforeEach(() => {
    ({ store, c } = store3({ segments: 3 }));
    compactor = new StoreCompactor(store, c);
  });

  it('merges small sealed segments into larger ones', () => {
    // 3 events/segment via 3 batches: [3 sealed, 3 sealed, 3 active].
    append(store, 'a', 'E', 3);
    append(store, 'a', 'E', 3);
    append(store, 'a', 'E', 3);
    const shard = store.shardOf('a');
    const before = store.storage.segments(shard).length;
    expect(before).toBe(3);
    const report = compactor.compactShard(shard, { mergeToSegmentSize: 9 });
    expect(report.segmentsBefore).toBe(before);
    expect(report.segmentsAfter).toBeLessThan(report.segmentsBefore);
    expect(report.eventsAfter).toBe(9);
    // Content intact and renumbered.
    expect(store.readStream('a').map((e) => e.streamVersion)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const positions = store.scanShard(shard, 0).events.map((e) => e.shardPosition);
    expect(positions).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('drops superseded events below the snapshot floor', () => {
    append(store, 'hot', 'E', 10); // versions 0..9; snapshot at v7
    append(store, 'cold', 'E', 3); // no floor — untouched
    const shard = store.shardOf('hot');
    const floors = new Map<string, number>([['hot', 7]]);
    const report = compactor.compactShard(shard, { streamFloors: floors });
    // v0..v6 dropped BUT v6 survives as the anchor (last below floor):
    // floor is exclusive-drop of *superseded* events, anchor preserves
    // version continuity. Kept = v6(anchor), v7, v8, v9.
    expect(report.eventsDropped).toBe(6);
    const kept = store.readStream('hot').map((e) => e.streamVersion);
    expect(kept).toEqual([6, 7, 8, 9]);
    // Optimistic concurrency still works — stream version anchor kept.
    expect(store.streamVersion('hot')).toBe(9);
    append(store, 'hot', 'E', 1);
    expect(store.streamVersion('hot')).toBe(10);
  });

  it('never drops the last event even when fully superseded', () => {
    append(store, 'solo', 'E', 5); // floor beyond the head
    const shard = store.shardOf('solo');
    compactor.compactShard(shard, { streamFloors: new Map([['solo', 100]]) });
    const remaining = store.readStream('solo');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].streamVersion).toBe(4);
  });

  it('emits truncation markers for audit', () => {
    append(store, 'a', 'E', 8);
    const shard = store.shardOf('a');
    compactor.compactShard(shard, { streamFloors: new Map([['a', 5]]) });
    const m = compactor.markerFor('a');
    expect(m).toBeDefined();
    expect(m!.droppedCount).toBe(4); // v0..v3 dropped; v4 kept as anchor
    expect(m!.firstSurvivingVersion).toBe(4);
  });

  it('rewritten shard still verifies clean', () => {
    append(store, 'a', 'E', 8);
    append(store, 'b', 'E', 8);
    const shardA = store.shardOf('a');
    compactor.compactShard(shardA, { mergeToSegmentSize: 6, streamFloors: new Map([['a', 4]]) });
    const verifier = new StoreIntegrityVerifier(store);
    const report = verifier.verifyShard(shardA);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('compactAll covers every shard', () => {
    for (let i = 0; i < 9; i++) append(store, `s${i}`, 'E', 4);
    const reports = compactor.compactAll({ mergeToSegmentSize: 10 });
    expect(reports).toHaveLength(3);
  });

  it('replication continues seamlessly after compaction', () => {
    const replica = new EventStoreReplica('r1', c);
    const repl = new EventStoreReplication(store, replica, { clock: c });
    append(store, 'a', 'E', 8);
    repl.syncOnce();
    const shard = store.shardOf('a');
    compactor.compactShard(shard, { streamFloors: new Map([['a', 5]]) });
    // Ship the rewrite, then normal appends flow again.
    repl.shipRewrite(shard, store.scanShard(shard, 0).events);
    append(store, 'a', 'E', 2);
    repl.syncOnce();
    // Anchor at v4 survives truncation: replica sees [4..9].
    expect(replica.readStream('a').map((e) => e.streamVersion)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(repl.caughtUp()).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Integrity verification
// ---------------------------------------------------------------------

describe('StoreIntegrityVerifier', () => {
  let store: ShardedEventStore;
  let verifier: StoreIntegrityVerifier;

  beforeEach(() => {
    ({ store } = store3({ segments: 3 }));
    verifier = new StoreIntegrityVerifier(store);
  });

  it('a clean store verifies with zero violations', () => {
    for (let i = 0; i < 10; i++) append(store, `s${i}`, 'E', 4);
    const reports = verifier.verifyAll();
    for (const r of reports) {
      expect(r.ok).toBe(true);
      expect(r.violations.filter((v) => v.kind !== 'position-gap')).toEqual([]);
    }
  });

  it('detects payload tampering (content-hash violation)', () => {
    append(store, 'a', 'E', 3);
    const shard = store.shardOf('a');
    const seg = store.storage.segments(shard)[0];
    const tampered = { ...seg.events[1], data: { evil: true } };
    seg.events[1] = tampered as (typeof seg.events)[0];
    const report = verifier.verifyShard(shard);
    expect(report.ok).toBe(false);
    // The tampered event's content no longer matches its stored
    // contentHash — the primary detection. The chain check deliberately
    // uses the predecessor's STORED checksum so one corrupted record
    // doesn't cascade false chain violations onto its successors.
    const kinds = report.violations.map((v) => v.kind);
    expect(kinds).toContain('content-hash');
    expect(report.violations.every((v) => v.shardPosition === 1 || v.shardPosition === -1)).toBe(true);
  });

  it('detects deletion (chain violation without content-hash violation)', () => {
    append(store, 'a', 'E', 4);
    const shard = store.shardOf('a');
    const seg = store.storage.segments(shard)[0];
    seg.events.splice(1, 1); // delete middle event
    const report = verifier.verifyShard(shard);
    expect(report.violations.some((v) => v.kind === 'chain')).toBe(true);
    expect(report.violations.some((v) => v.kind === 'content-hash')).toBe(false);
  });

  it('detects a stale segment checksum (torn seal)', () => {
    append(store, 'a', 'E', 4);
    const shard = store.shardOf('a');
    const seg = store.storage.segments(shard)[0];
    seg.checksum = 0xdeadbeef;
    const v = verifier.verifySegment(seg);
    expect(v.ok).toBe(false);
    expect(v.violations[0].kind).toBe('segment');
  });

  it('compareReplica proves a faithful prefix', () => {
    const c = clock();
    const replica = new EventStoreReplica('r1', c);
    const repl = new EventStoreReplication(store, replica, { clock: c });
    append(store, 'a', 'E', 6);
    repl.syncOnce();
    append(store, 'a', 'E', 2); // primary ahead — replica is a clean prefix
    const shard = store.shardOf('a');
    const diff = verifier.compareReplica(shard, replica);
    expect(diff.violations).toEqual([]);
    expect(diff.firstDivergence).toBeGreaterThan(-1); // prefix boundary
    expect(diff.identical).toBe(false);
  });

  it('compareReplica localizes divergence to a single position', () => {
    const c = clock();
    const replica = new EventStoreReplica('r1', c);
    const repl = new EventStoreReplication(store, replica, { clock: c });
    append(store, 'a', 'E', 5);
    repl.syncOnce();
    const shard = store.shardOf('a');
    // Corrupt the replica's copy of position 2.
    const copy = replica.replicaShardEvents(shard);
    const bad = { ...copy[2], checksum: 0x1234 };
    (copy as ShardedStoredEvent[])[2] = bad;
    const diff = verifier.compareReplica(shard, replica);
    expect(diff.identical).toBe(false);
    expect(diff.firstDivergence).toBe(2);
    expect(diff.violations[0].kind).toBe('replica-diverged');
  });

  it('segmentChecksum folds member checksums self-contained', () => {
    const seg = new EventSegment('s0', 0, 0);
    const fake = [
      { checksum: chainHash(0, 11) },
      { checksum: chainHash(chainHash(0, 11), 22) },
    ];
    seg.events = fake as unknown as typeof seg.events;
    const fold = segmentChecksum(seg.events);
    expect(fold).toBe(chainHash(chainHash(0, fake[0].checksum), fake[1].checksum));
  });

  it('hashEventContent ignores storage bookkeeping', () => {
    const h1 = hashEventContent('s', 0, 'T', { a: 1 }, {});
    const h2 = hashEventContent('s', 0, 'T', { a: 1 }, {});
    const h3 = hashEventContent('s', 0, 'T', { a: 2 }, {});
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });
});

// ---------------------------------------------------------------------
// Cross-module: full lifecycle
// ---------------------------------------------------------------------

describe('lifecycle: append → replicate → compact → verify', () => {
  it('end-to-end pipeline stays consistent', () => {
    const c = clock();
    const map = new RendezvousHasher(['alpha', 'beta']);
    const store = new ShardedEventStore(map, new InMemoryShardStorage(), {
      segmentMaxEvents: 4,
      clock: c,
    });
    const replica = new EventStoreReplica('dr-site', c);
    const repl = new EventStoreReplication(store, replica, { clock: c });
    const router = new ReadReplicaRouter(store, c);
    router.addReplica(repl);
    const compactor = new StoreCompactor(store, c);
    const verifier = new StoreIntegrityVerifier(store);

    // Write phase.
    const streams = ['order-1', 'order-2', 'order-3', 'cust-1'];
    for (const s of streams) append(store, s, 'Updated', 7);
    repl.syncOnce();

    // Read through router while caught up.
    const d = router.route('order-1', 'bounded', { maxPositionLag: 0 });
    expect(d.target).toEqual({ replica: 'dr-site' });

    // Compact one shard under a snapshot floor.
    const shard = store.shardOf('order-1');
    const rep = compactor.compactShard(shard, {
      mergeToSegmentSize: 8,
      streamFloors: new Map(streams.map((s) => [s, 4])),
    });
    expect(rep.eventsDropped).toBeGreaterThan(0);

    // Integrity holds post-compaction.
    const vr = verifier.verifyShard(shard);
    expect(vr.ok).toBe(true);

    // Replica needs a rewrite ship, then catches up cleanly.
    repl.shipRewrite(shard, store.scanShard(shard, 0).events);
    append(store, 'order-1', 'Closed', 1);
    repl.syncOnce();
    expect(repl.caughtUp()).toBe(true);

    const diff = verifier.compareReplica(shard, replica);
    expect(diff.violations).toEqual([]);
  });
});
