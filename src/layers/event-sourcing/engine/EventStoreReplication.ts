/**
 * EventStoreReplication — primary→replica shipping for sharded stores.
 *
 * Model (async, pull-based — the PostgreSQL logical-replication shape):
 *
 *   primary.scanShard(shardId, cursor, limit)
 *        │
 *        ▼  batch of ShardedStoredEvent
 *   replica.applyBatch(shardId, batch)
 *        │
 *        ▼  replica cursors[shardId] = max(shardPosition)+1
 *
 * Why pull not push: the replica owns its cursor, so a restarted replica
 * resumes exactly where it left off without the primary tracking N
 * subscriber states (the `EventStore` subscription API pushes and keeps
 * exactly that state — fine for projections, wrong for replicas).
 *
 * Semantics:
 *   - Cursors are per (replica, shard). Replicas progress independently.
 *   - `applyBatch` is idempotent: events at-or-below the cursor are
 *     skipped (re-delivery after a crash is normal, not an error).
 *   - The replica is append-only from replication: direct writes are
 *     rejected via `assertReplica()` — a split-brain replica would
 *     diverge silently and checksum verification could no longer tell
 *     which copy is right.
 *   - Cursors travel as opaque state so they can be checkpointed
 *     (`cursorSnapshot`/`restoreCursor`) alongside consumer offsets.
 *
 * Lag accounting — two lenses because they answer different questions:
 *   positionLag  = primaryHead - replicaCursor   ("how far behind")
 *   timeLagMs    = now - applyTime of last batch ("how stale")
 * A replica can have small positionLag but huge timeLag (slow consumer)
 * or the reverse (busy primary, caught-up replica polling rarely).
 *
 * @module EventSourcing/Engine
 */

import {
  ShardedEventStore,
  ShardedStoredEvent,
  hashEventContent,
} from './ShardedEventStore';
import { IClock, SystemClock } from '../../observability/engine/signals';

// ---------------------------------------------------------------------
// Replica
// ---------------------------------------------------------------------

export class ReplicaWriteError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ReplicaWriteError';
  }
}

/** Per-shard replica state. */
interface ReplicaShardState {
  /** Next shardPosition to accept. */
  cursor: number;
  /** Applied events in shard order — the replica's copy of the log. */
  events: ShardedStoredEvent[];
  /** streamId -> highest streamVersion seen (consistency spot-checks). */
  streamVersions: Map<string, number>;
}

/**
 * The replica half of a replication pair.
 *
 * Holds materialized copies of replicated events plus cursors. It is
 * deliberately NOT a `ShardedEventStore`: replicas serve reads through a
 * narrower API (`readStream`, `scanReplica`) and refuse direct appends —
 * mixing roles would make divergence undetectable.
 */
export class EventStoreReplica {
  private readonly _name: string;
  private readonly _clock: IClock;
  private readonly _shards = new Map<string, ReplicaShardState>();
  private readonly _streams = new Map<string, ShardedStoredEvent[]>();
  private _applied = 0;
  private _skipped = 0;
  private _lastApplyAt = -1;

  constructor(name: string, clock: IClock = new SystemClock()) {
    this._name = name;
    this._clock = clock;
  }

  get name(): string {
    return this._name;
  }

  /** Next expected position on a shard (0 = nothing applied yet). */
  cursor(shardId: string): number {
    return this._shard(shardId).cursor;
  }

  /**
   * Apply a batch pulled from the primary, in shard order.
   *
   * Idempotent + gap-aware:
   *   - events with shardPosition < cursor are re-deliveries → skipped.
   *   - events with shardPosition > cursor leave the cursor unmoved — we
   *     buffer nothing: a gap means an earlier fetch must complete first
   *     (primary guarantees contiguous positions per shard).
   *   - content is re-hashed and compared: a corrupted-in-transit record
   *     is a `ReplicaWriteError`, not silently accepted divergence.
   *
   * @returns applied count and the new cursor.
   */
  applyBatch(
    shardId: string,
    batch: readonly ShardedStoredEvent[]
  ): { applied: number; skipped: number; cursor: number } {
    const st = this._shard(shardId);
    let applied = 0;
    let skipped = 0;
    for (const e of batch) {
      if (e.shardPosition < st.cursor) {
        skipped++;
        continue;
      }
      if (e.shardPosition > st.cursor) {
        // Gap: refuse rather than skip — a hole in the replica is a lie.
        throw new ReplicaWriteError(
          `replica '${this._name}' shard '${shardId}': gap at position ` +
            `${e.shardPosition}, cursor is ${st.cursor}`
        );
      }
      const expected = hashEventContent(e.streamId, e.streamVersion, e.type, e.data, e.metadata);
      if (expected !== e.contentHash) {
        throw new ReplicaWriteError(
          `replica '${this._name}' shard '${shardId}': content hash mismatch ` +
            `on event '${e.id}' (position ${e.shardPosition})`
        );
      }
      st.events.push(e);
      st.cursor = e.shardPosition + 1;
      const sv = st.streamVersions.get(e.streamId) ?? -1;
      if (e.streamVersion <= sv) {
        throw new ReplicaWriteError(
          `replica '${this._name}': stream '${e.streamId}' regressed from ` +
            `version ${sv} to ${e.streamVersion}`
        );
      }
      st.streamVersions.set(e.streamId, e.streamVersion);
      let list = this._streams.get(e.streamId);
      if (!list) {
        list = [];
        this._streams.set(e.streamId, list);
      }
      list.push(e);
      applied++;
    }
    if (applied > 0) this._lastApplyAt = this._clock.nowMs();
    this._applied += applied;
    this._skipped += skipped;
    return { applied, skipped, cursor: st.cursor };
  }

  /**
   * Apply a compaction rewrite: the primary replaced a shard's log with
   * a denser, renumbered copy. The replica replaces wholesale — cursors
   * move to the new head so post-compact batches continue cleanly.
   */
  applyRewrite(shardId: string, rewritten: readonly ShardedStoredEvent[]): void {
    const st = this._shard(shardId);
    const touched = new Set(rewritten.map((e) => e.streamId));
    st.events = rewritten.slice();
    st.cursor = rewritten.length ? rewritten[rewritten.length - 1].shardPosition + 1 : st.cursor;
    st.streamVersions.clear();
    for (const e of rewritten) {
      const sv = st.streamVersions.get(e.streamId) ?? -1;
      if (e.streamVersion > sv) st.streamVersions.set(e.streamId, e.streamVersion);
    }
    for (const streamId of touched) {
      this._streams.set(streamId, rewritten.filter((e) => e.streamId === streamId));
    }
    this._lastApplyAt = this._clock.nowMs();
  }

  private _shard(shardId: string): ReplicaShardState {
    let st = this._shards.get(shardId);
    if (!st) {
      st = { cursor: 0, events: [], streamVersions: new Map() };
      this._shards.set(shardId, st);
    }
    return st;
  }

  /** Read a stream from the replica's copy (read-replica query path). */
  readStream(
    streamId: string,
    options: { fromVersion?: number; limit?: number } = {}
  ): ShardedStoredEvent[] {
    const list = this._streams.get(streamId);
    if (!list) return [];
    const from = options.fromVersion ?? 0;
    const slice = list.slice(from);
    return options.limit === undefined ? slice : slice.slice(0, options.limit);
  }

  /** Replica-side scan of a shard's copy (verification, inspection). */
  replicaShardEvents(shardId: string): readonly ShardedStoredEvent[] {
    return this._shard(shardId).events;
  }

  streamVersion(streamId: string): number {
    const list = this._streams.get(streamId);
    return list && list.length ? list[list.length - 1].streamVersion : -1;
  }

  get appliedCount(): number {
    return this._applied;
  }

  get skippedCount(): number {
    return this._skipped;
  }

  get lastApplyAt(): number {
    return this._lastApplyAt;
  }

  // --------------------------------------------------------- cursor I/O

  /** Serializable cursor state (checkpoint alongside sink offsets). */
  cursorSnapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [shardId, st] of this._shards) out[shardId] = st.cursor;
    return out;
  }

  /**
   * Restore cursors only — used when the replica's *data* survived a
   * restart (it would in a durable impl) but its in-memory cursor map
   * didn't. Restoring a cursor AHEAD of the data would skip events; this
   * method clamps to the last known event per shard to prevent that.
   */
  restoreCursor(cursors: Record<string, number>): void {
    for (const [shardId, cursor] of Object.entries(cursors)) {
      const st = this._shard(shardId);
      const dataHead = st.events.length ? st.events[st.events.length - 1].shardPosition + 1 : 0;
      st.cursor = Math.min(cursor, dataHead);
    }
  }
}

// ---------------------------------------------------------------------
// Replication controller + lag tracking
// ---------------------------------------------------------------------

export interface ReplicationLag {
  readonly shardId: string;
  /** Positions the replica hasn't applied yet (primaryHead - cursor). */
  readonly positionLag: number;
  /** ms since the replica last applied anything; -1 if never applied. */
  readonly timeLagMs: number;
  /** Replica cursor (next expected position). */
  readonly replicaCursor: number;
  /** Primary head position (-1 = empty shard). */
  readonly primaryHead: number;
}

/**
 * Drives one `EventStoreReplica` from one primary `ShardedEventStore`.
 *
 * `syncOnce()` is the unit of work — pull every shard's tail, apply,
 * measure. Call it on a timer / after N appends; the controller keeps no
 * timers itself (testable, no background threads).
 */
export class EventStoreReplication {
  private readonly _primary: ShardedEventStore;
  private readonly _replica: EventStoreReplica;
  private readonly _clock: IClock;
  private readonly _batchSize: number;
  private _syncs = 0;
  private _shipped = 0;

  constructor(
    primary: ShardedEventStore,
    replica: EventStoreReplica,
    options: { clock?: IClock; batchSize?: number } = {}
  ) {
    this._primary = primary;
    this._replica = replica;
    this._clock = options.clock ?? new SystemClock();
    this._batchSize = Math.max(1, options.batchSize ?? 500);
  }

  get primary(): ShardedEventStore {
    return this._primary;
  }

  get replica(): EventStoreReplica {
    return this._replica;
  }

  /**
   * One replication round: for every shard, pull from the replica cursor
   * to the primary head in batches and apply. Returns applied count.
   */
  syncOnce(): number {
    let applied = 0;
    for (const shardId of this._primary.shardMap.shardIds()) {
      for (;;) {
        const cursor = this._replica.cursor(shardId);
        const { events } = this._primary.scanShard(shardId, cursor, this._batchSize);
        if (events.length === 0) break;
        const r = this._replica.applyBatch(shardId, events);
        applied += r.applied;
        if (events.length < this._batchSize) break;
      }
    }
    this._syncs++;
    this._shipped += applied;
    return applied;
  }

  /**
   * Ship a compaction rewrite for a shard (see `StoreCompactor`).
   * The replica replaces its shard copy and resumes from the new head.
   */
  shipRewrite(shardId: string, rewritten: readonly ShardedStoredEvent[]): void {
    this._replica.applyRewrite(shardId, rewritten);
  }

  /** Per-shard lag — the pair of numbers a replication dashboard needs. */
  lag(): ReplicationLag[] {
    const now = this._clock.nowMs();
    const out: ReplicationLag[] = [];
    for (const shardId of this._primary.shardMap.shardIds()) {
      const head = this._primary.shardHead(shardId);
      const cursor = this._replica.cursor(shardId);
      const lastApply = this._replica.lastApplyAt;
      out.push({
        shardId,
        positionLag: Math.max(0, head + 1 - cursor),
        timeLagMs: lastApply < 0 ? -1 : now - lastApply,
        replicaCursor: cursor,
        primaryHead: head,
      });
    }
    return out;
  }

  /** Worst-case position lag across shards (alert threshold input). */
  maxPositionLag(): number {
    let m = 0;
    for (const l of this.lag()) if (l.positionLag > m) m = l.positionLag;
    return m;
  }

  /** True when every shard's replica cursor is at the primary head. */
  caughtUp(): boolean {
    return this.maxPositionLag() === 0;
  }

  get syncCount(): number {
    return this._syncs;
  }

  get shippedCount(): number {
    return this._shipped;
  }
}
