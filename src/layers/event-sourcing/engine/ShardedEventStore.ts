/**
 * ShardedEventStore — horizontally partitioned append-only event storage.
 *
 * The monolithic `EventStore` (implementations/) keeps one global log.
 * That stops scaling when a single node can't hold the log or serve the
 * append rate. This module splits the keyspace: every stream lives on
 * exactly one shard, chosen by a pluggable `ShardMap` (consistent-hash
 * ring or rendezvous hasher — see Sharding.ts).
 *
 * Per-shard storage model — segments, not one big array:
 *
 *   shard-0/
 *     seg-000000  (sealed)   events [0..1499]   + checksum
 *     seg-000001  (sealed)   events [1500..2999] + checksum
 *     seg-000002  (active)   events [3000..]
 *
 * Segments exist because compaction and integrity verification want
 * immutable, independently-checksummed units — you can't fsync "half an
 * array", but you can seal a segment and checksum it once.
 *
 * Ordering model:
 *   - Stream order is total and contiguous (0,1,2,...) — required by
 *     optimistic-concurrency appends.
 *   - Shard order is a per-shard sequence (`shardPosition`), contiguous
 *     across segments of the shard — this is what replication ships.
 *   - There is NO global order across shards. A store-wide scan merges
 *     per-shard logs by timestamp, which is an approximation — documented
 *     as such. Cross-shard transactions are out of scope by design.
 *
 * Complexity notes:
 *   - append: O(k) for k events + O(1) shard routing + O(log V) ring
 *     lookup. Optimistic-concurrency check is O(1).
 *   - readStream: O(n) segment-aware concat; a read that spans a sealed
 *     and an active segment touches both exactly once.
 *   - scanShard: O(n) forward iterator over the shard sequence.
 *   - addShard/removeShard: full keyspace rehash — O(total events). This
 *     is deliberately a control-plane operation; in production you'd run
 *     it off-peak (same as Kafka partition reassignment).
 *
 * @module EventSourcing/Engine
 */

import {
  StoredEvent,
  EventMetadata,
  ConcurrencyError,
  ANY,
  NO_STREAM,
  STREAM_EXISTS,
  ExpectedVersion,
} from '../implementations/EventStore';
import { IClock, SystemClock } from '../../observability/engine/signals';
import { ShardMap, fnv1a, chainHash } from './Sharding';

// ---------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------

/**
 * A stored event annotated with its shard-local sequence. This is the
 * unit replication ships and segments persist — the `globalPosition` of
 * the source store is meaningless here (there is no cross-shard order),
 * so `shardPosition` is the canonical cursor.
 */
export interface ShardedStoredEvent extends StoredEvent {
  /** Shard that owns the stream. */
  readonly shardId: string;
  /** Contiguous per-shard sequence number (0-based) — may have holes
   *  after a stream migrates out; compaction renumbers contiguously. */
  readonly shardPosition: number;
  /**
   * FNV-1a over the event's immutable content (type + payload + metadata
   *  + streamId + streamVersion). Stable across shard migration and
   *  renumbering — this is the tamper-evidence anchor.
   */
  readonly contentHash: number;
  /**
   * Rolling shard chain: `chainHash(prevEvent.checksum, contentHash)` in
   * shardPosition order. Contextual — rewritten whenever the shard's
   * event set is rewritten (stream migration, compaction) so the chain
   * always verifies over the CURRENT contents.
   */
  readonly checksum: number;
}

/** Events handed to the store (pre-commit). Mirrors `NewEvent`. */
export interface ShardAppendEvent<TPayload = unknown> {
  readonly type: string;
  readonly schemaVersion?: number;
  readonly data: TPayload;
  readonly metadata?: EventMetadata;
}

export class ShardNotFoundError extends Error {
  constructor(public readonly shardId: string) {
    super(`shard '${shardId}' does not exist`);
    this.name = 'ShardNotFoundError';
  }
}

// ---------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------

/**
 * One run of shard events. Sealing marks it immutable *for appends* —
 * maintenance operations (stream eviction during migration, compaction)
 * may still rewrite contents, and always refresh `checksum` afterwards.
 *
 * `checksum` is a self-contained fold: `chainHash` over the segment's
 * own events' `checksum` values starting from 0. It does NOT depend on
 * other segments, which is what makes per-segment verification possible.
 */
export class EventSegment {
  readonly id: string;
  readonly shardId: string;
  /** Shard position of the first event as written. */
  readonly firstShardPosition: number;
  /** Event payload — treated as immutable by writers, rewritten by
   *  maintenance paths that then refresh `checksum`. */
  events: ShardedStoredEvent[] = [];
  /** `chainHash` fold over `events[].checksum`; see `StoreIntegrityVerifier`. */
  checksum = 0;
  sealed = false;
  sealedAt = 0;

  constructor(shardId: string, index: number, firstShardPosition: number) {
    this.shardId = shardId;
    this.id = `${shardId}/seg-${index.toString().padStart(6, '0')}`;
    this.firstShardPosition = firstShardPosition;
  }

  get lastShardPosition(): number {
    return this.firstShardPosition + this.events.length - 1;
  }

  get size(): number {
    return this.events.length;
  }
}

/**
 * Everything `ShardedEventStore` needs to persist. The default in-memory
 * implementation below satisfies it; a disk-backed adapter would map
 * segments to files.
 */
export interface ShardStorageAdapter {
  /** Append events to the (possibly new) active segment; returns them. */
  append(shardId: string, events: ShardedStoredEvent[]): EventSegment;
  /** Seal the shard's active segment if it has >= `minSize` events. */
  sealIfFull(shardId: string, maxSize: number): EventSegment | null;
  /** All segments of a shard, oldest first. */
  segments(shardId: string): EventSegment[];
  /** Replace a shard's whole segment list — compaction output path. */
  replaceSegments(shardId: string, segments: EventSegment[]): void;
  /** Drop a shard entirely (stream migration during rescale). */
  deleteShard(shardId: string): void;
}

/**
 * Default storage: Map<shardId, EventSegment[]>.
 * O(1) append to the tail segment; sealing is a flag flip.
 */
export class InMemoryShardStorage implements ShardStorageAdapter {
  private readonly _shards = new Map<string, EventSegment[]>();
  private readonly _nextIndex = new Map<string, number>();

  append(shardId: string, events: ShardedStoredEvent[]): EventSegment {
    let segs = this._shards.get(shardId);
    if (!segs) {
      segs = [];
      this._shards.set(shardId, segs);
      this._nextIndex.set(shardId, 0);
    }
    let active = segs.length ? segs[segs.length - 1] : null;
    if (!active || active.sealed) {
      const idx = this._nextIndex.get(shardId) ?? 0;
      this._nextIndex.set(shardId, idx + 1);
      active = new EventSegment(
        shardId,
        idx,
        events.length ? events[0].shardPosition : active ? active.lastShardPosition + 1 : 0
      );
      segs.push(active);
    }
    for (const e of events) {
      active.events.push(e);
      active.checksum = chainHash(active.checksum, e.checksum);
    }
    return active;
  }

  sealIfFull(shardId: string, maxSize: number): EventSegment | null {
    const segs = this._shards.get(shardId);
    if (!segs || !segs.length) return null;
    const active = segs[segs.length - 1];
    if (active.sealed || active.size < maxSize) return null;
    active.sealed = true;
    return active;
  }

  segments(shardId: string): EventSegment[] {
    return this._shards.get(shardId) ?? [];
  }

  replaceSegments(shardId: string, segments: EventSegment[]): void {
    this._shards.set(shardId, segments);
    this._nextIndex.set(shardId, segments.length);
  }

  deleteShard(shardId: string): void {
    this._shards.delete(shardId);
    this._nextIndex.delete(shardId);
  }

  shardIds(): string[] {
    return [...this._shards.keys()];
  }
}

// ---------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------

export interface ShardedEventStoreConfig {
  /** Events per segment before it is sealed and a new one opens. */
  segmentMaxEvents?: number;
  /** Clock for event timestamps (injectable for tests). */
  clock?: IClock;
}

let shardEventCounter = 0;

function genShardEventId(clock: IClock): string {
  return `evt-${clock.nowMs().toString(36)}-${(shardEventCounter++).toString(36)}`;
}

/**
 * Content hash of an event's logical payload — everything except storage
 * bookkeeping (shardPosition, timestamp, id). Stable across migration and
 * compaction renumbering, which is what makes content-based tamper
 * detection possible.
 */
export function hashEventContent(
  streamId: string,
  streamVersion: number,
  type: string,
  data: unknown,
  metadata: EventMetadata
): number {
  return fnv1a(type + JSON.stringify(data) + JSON.stringify(metadata) + streamId + streamVersion);
}

/** Re-fold a segment's self-contained checksum from its events. */
export function segmentChecksum(events: readonly { checksum: number }[]): number {
  let h = 0;
  for (const e of events) h = chainHash(h, e.checksum);
  return h;
}

/**
 * The sharded store. All public entry points take a `streamId`; routing
 * through `ShardMap` is internal, so callers never think about shards.
 */
export class ShardedEventStore {
  private readonly _map: ShardMap;
  private readonly _storage: ShardStorageAdapter;
  private readonly _segmentMax: number;
  private readonly _clock: IClock;
  /** streamId -> stream version (highest contiguous). -1 = absent. */
  private readonly _versions = new Map<string, number>();
  /** shardId -> next shard position. */
  private readonly _nextShardPosition = new Map<string, number>();
  /** streamId -> ordered event list, for O(n) stream reads. The segments
   *  are the *durable* layout; this index is the read accelerator — a
   *  real implementation would page it from segments on cold access. */
  private readonly _streams = new Map<string, ShardedStoredEvent[]>();
  private _appends = 0;
  private _conflicts = 0;

  constructor(
    map: ShardMap,
    storage: ShardStorageAdapter = new InMemoryShardStorage(),
    config: ShardedEventStoreConfig = {}
  ) {
    this._map = map;
    this._storage = storage;
    this._segmentMax = Math.max(1, config.segmentMaxEvents ?? 1500);
    this._clock = config.clock ?? new SystemClock();
  }

  get shardMap(): ShardMap {
    return this._map;
  }

  get storage(): ShardStorageAdapter {
    return this._storage;
  }

  /** Shard owning a stream under the current topology. */
  shardOf(streamId: string): string {
    return this._map.shardOf(streamId);
  }

  /** Current stream version, or -1 if the stream doesn't exist. */
  streamVersion(streamId: string): number {
    return this._versions.get(streamId) ?? -1;
  }

  /** Highest shard position written on a shard (-1 = empty). */
  shardHead(shardId: string): number {
    return (this._nextShardPosition.get(shardId) ?? 0) - 1;
  }

  /**
   * Append `events` to a stream with optimistic concurrency.
   *
   * expectedVersion semantics (same sentinels as `EventStore`):
   *   ANY (-2):           no check
   *   NO_STREAM (-1):     stream must not exist
   *   STREAM_EXISTS (-3): stream must exist
   *   n >= 0:             exact current version required
   *
   * On conflict: throws `ConcurrencyError` and appends nothing — the
   * check-then-append is atomic in the single-threaded runtime.
   *
   * @returns the committed events with shard annotations, in commit order.
   */
  appendToStream(
    streamId: string,
    expectedVersion: ExpectedVersion,
    events: readonly ShardAppendEvent[]
  ): ShardedStoredEvent[] {
    if (events.length === 0) return [];
    const current = this._versions.get(streamId) ?? -1;
    const ok =
      expectedVersion === ANY ||
      (expectedVersion === NO_STREAM && current === -1) ||
      (expectedVersion === STREAM_EXISTS && current !== -1) ||
      expectedVersion === current;
    if (!ok) {
      this._conflicts++;
      throw new ConcurrencyError(streamId, expectedVersion, current);
    }

    const shardId = this._map.shardOf(streamId);
    let shardPos = this._nextShardPosition.get(shardId) ?? 0;
    let streamVer = current;
    // Chain continues from the LAST EVENT's checksum (not the segment
    // checksum — those are different fold domains, see integrity docs).
    let rolling = this._lastEventChecksum(shardId);
    const out: ShardedStoredEvent[] = [];

    for (const e of events) {
      streamVer++;
      const contentHash = hashEventContent(
        streamId,
        streamVer,
        e.type,
        e.data,
        e.metadata ?? {}
      );
      const checksum = chainHash(rolling, contentHash);
      const stored: ShardedStoredEvent = {
        id: genShardEventId(this._clock),
        streamId,
        streamVersion: streamVer,
        // No meaningful cross-shard global order: reuse shardPosition so
        // generic consumers (upcasters, replay code) still see a position.
        globalPosition: shardPos,
        type: e.type,
        schemaVersion: e.schemaVersion ?? 1,
        data: e.data,
        metadata: e.metadata ?? {},
        timestamp: this._clock.nowMs(),
        shardId,
        shardPosition: shardPos,
        contentHash,
        checksum,
      };
      rolling = checksum;
      shardPos++;
      out.push(stored);
    }

    this._storage.append(shardId, out);
    this._nextShardPosition.set(shardId, shardPos);
    this._versions.set(streamId, streamVer);
    let list = this._streams.get(streamId);
    if (!list) {
      list = [];
      this._streams.set(streamId, list);
    }
    for (const e of out) list.push(e);
    this._appends += out.length;

    this._storage.sealIfFull(shardId, this._segmentMax);
    return out;
  }

  /** Last event checksum on a shard — the chain tail new appends extend. */
  private _lastEventChecksum(shardId: string): number {
    const segs = this._storage.segments(shardId);
    if (!segs.length) return 0;
    const tail = segs[segs.length - 1];
    if (!tail.events.length) return 0;
    return tail.events[tail.events.length - 1].checksum;
  }

  /**
   * Read a stream's events in order. `fromVersion`/`limit` mirror
   * `EventStore.readStream`. O(n) over the stream list.
   */
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

  /**
   * Forward iterator over a shard's contiguous sequence — the replication
   * pull API. `fromPosition` inclusive. O(k) for k returned events.
   */
  scanShard(
    shardId: string,
    fromPosition: number,
    limit = 1000
  ): { events: ShardedStoredEvent[]; nextPosition: number } {
    const segs = this._storage.segments(shardId);
    if (!segs.length) return { events: [], nextPosition: 0 };
    const out: ShardedStoredEvent[] = [];
    // Position filter (not offset math): stream migration can leave holes
    // in shardPosition, so index arithmetic would skip live events.
    for (const seg of segs) {
      for (const e of seg.events) {
        if (e.shardPosition < fromPosition) continue;
        out.push(e);
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }
    const next = out.length ? out[out.length - 1].shardPosition + 1 : fromPosition;
    return { events: out, nextPosition: next };
  }

  /**
   * Merge-scan across all shards ordered by timestamp — approximation of
   * a global log. Because there is no true cross-shard order, ties and
   * clock skew make this best-effort; per-shard order is always exact.
   */
  scanAll(options: { limit?: number } = {}): ShardedStoredEvent[] {
    const all: ShardedStoredEvent[] = [];
    for (const shardId of this._map.shardIds()) {
      let pos = 0;
      for (;;) {
        const { events, nextPosition } = this.scanShard(shardId, pos, 10_000);
        all.push(...events);
        if (events.length === 0) break;
        pos = nextPosition;
      }
    }
    all.sort((a, b) => a.timestamp - b.timestamp || a.shardPosition - b.shardPosition);
    return options.limit === undefined ? all : all.slice(0, options.limit);
  }

  /**
   * Topology change: register the shard, then rehash every stream and
   * physically migrate the ones that now belong elsewhere.
   *
   * Migration replays each moved stream's events into the destination
   * shard with fresh shard positions; stream versions are preserved so
   * optimistic concurrency isn't violated. Returns a per-stream move
   * report. O(total events) — see module docs.
   */
  addShard(shardId: string): { moved: number; moves: { streamId: string; from: string; to: string }[] } {
    this._map.addShard(shardId);
    return this._rehash();
  }

  /**
   * Topology change: drop a shard and migrate its streams to the
   * remaining owners. The shard must exist in the map; its storage is
   * deleted after the streams are re-homed.
   */
  removeShard(shardId: string): { moved: number; moves: { streamId: string; from: string; to: string }[] } {
    const segs = this._storage.segments(shardId);
    if (!segs.length && !this._map.shardIds().includes(shardId)) {
      throw new ShardNotFoundError(shardId);
    }
    this._map.removeShard(shardId);
    return this._rehash();
  }

  private _rehash(): { moved: number; moves: { streamId: string; from: string; to: string }[] } {
    const moves: { streamId: string; from: string; to: string }[] = [];
    // Snapshot the stream table first — appending during iteration is fine
    // (we add new lists) but we only migrate what existed at call time.
    const snapshot = [...this._streams.entries()];
    for (const [streamId, events] of snapshot) {
      if (!events.length) continue;
      const from = events[0].shardId;
      const to = this._map.shardOf(streamId);
      if (from === to) continue;
      this._migrateStream(streamId, events, from, to);
      moves.push({ streamId, from, to });
    }
    // Drop emptied shards' storage.
    for (const shardId of this._shardIdsWithStorage()) {
      if (this._shardIsEmpty(shardId)) this._storage.deleteShard(shardId);
    }
    return { moved: moves.length, moves };
  }

  private _shardIdsWithStorage(): string[] {
    const ids = new Set<string>();
    for (const e of this._allEvents()) ids.add(e.shardId);
    return [...ids];
  }

  private *_allEvents(): Generator<ShardedStoredEvent> {
    for (const list of this._streams.values()) yield* list;
  }

  private _shardIsEmpty(shardId: string): boolean {
    return this._storage.segments(shardId).length === 0;
  }

  /**
   * Re-home one stream: append copies to the destination shard (new
   * shardPositions + re-chained checksums) and purge the source copies
   * from their segments. Stream version + event ids are preserved —
   * replication cursors may be mid-flight, so ids must stay stable.
   */
  private _migrateStream(
    streamId: string,
    events: ShardedStoredEvent[],
    fromShard: string,
    toShard: string
  ): void {
    let shardPos = this._nextShardPosition.get(toShard) ?? 0;
    let rolling = this._lastEventChecksum(toShard);
    const moved: ShardedStoredEvent[] = [];
    for (const e of events) {
      const checksum = chainHash(rolling, e.contentHash);
      moved.push({ ...e, shardId: toShard, shardPosition: shardPos, globalPosition: shardPos, checksum });
      rolling = checksum;
      shardPos++;
    }
    this._storage.append(toShard, moved);
    this._nextShardPosition.set(toShard, shardPos);
    this._storage.sealIfFull(toShard, this._segmentMax);

    // Remove the migrated events from the source shard's segments, then
    // re-walk the shard re-chaining every surviving event's `checksum` —
    // the chain must verify over current contents at all times.
    const ids = new Set(events.map((e) => e.id));
    const segs = this._storage.segments(fromShard);
    const kept: EventSegment[] = [];
    for (const seg of segs) {
      const survivors = seg.events.filter((e) => !ids.has(e.id));
      if (survivors.length === 0) continue;
      seg.events = survivors;
      kept.push(seg);
    }
    let running = 0;
    for (const seg of kept) {
      seg.events = seg.events.map((e) => {
        const checksum = chainHash(running, e.contentHash);
        running = checksum;
        return { ...e, checksum };
      });
      seg.checksum = 0;
      for (const e of seg.events) seg.checksum = chainHash(seg.checksum, e.checksum);
    }
    this._storage.replaceSegments(
      fromShard,
      kept.map((seg, i) => {
        const fresh = new EventSegment(fromShard, i, seg.firstShardPosition);
        fresh.events.push(...seg.events);
        fresh.checksum = seg.checksum;
        fresh.sealed = seg.sealed;
        fresh.sealedAt = seg.sealedAt;
        return fresh;
      })
    );

    // Point the stream index at the moved copies.
    this._streams.set(streamId, moved);
  }

  /**
   * Maintenance hook: after `StoreCompactor` rewrites a shard's segments
   * (renumbered, possibly truncated), rebuild the store-side indexes that
   * shard — stream index, version index, next position. The compactor
   * owns the segment rewrite; the store owns the read accelerators.
   * Internal — not part of the public write API.
   */
  reindexShard(shardId: string, events: readonly ShardedStoredEvent[]): void {
    // Remove all index entries pointing at this shard.
    for (const [streamId, list] of [...this._streams.entries()]) {
      if (list.length && list[0].shardId === shardId) this._streams.delete(streamId);
    }
    for (const [streamId] of [...this._versions.entries()]) {
      const list = this._streams.get(streamId);
      if (!list || !list.length) this._versions.delete(streamId);
    }
    // Rebuild from the rewritten set.
    let head = -1;
    for (const e of events) {
      let list = this._streams.get(e.streamId);
      if (!list) {
        list = [];
        this._streams.set(e.streamId, list);
      }
      list.push(e);
      const v = this._versions.get(e.streamId) ?? -1;
      if (e.streamVersion > v) this._versions.set(e.streamId, e.streamVersion);
      if (e.shardPosition > head) head = e.shardPosition;
    }
    this._nextShardPosition.set(shardId, head + 1);
  }

  // ------------------------------------------------------------ stats

  get appendedCount(): number {
    return this._appends;
  }

  get conflictCount(): number {
    return this._conflicts;
  }

  streamIds(): string[] {
    return [...this._streams.keys()];
  }

  /**
   * Per-shard load report — the input to a rebalance decision. Includes
   * stream count, event count, segment count, and head position.
   */
  shardStats(): { shardId: string; streams: number; events: number; segments: number; head: number }[] {
    const stats = new Map<string, { streams: number; events: number; segments: number; head: number }>();
    for (const id of this._map.shardIds()) {
      stats.set(id, { streams: 0, events: 0, segments: this._storage.segments(id).length, head: this.shardHead(id) });
    }
    for (const events of this._streams.values()) {
      if (!events.length) continue;
      const s = stats.get(events[0].shardId);
      if (s) {
        s.streams++;
        s.events += events.length;
      }
    }
    return [...stats.entries()].map(([shardId, s]) => ({ shardId, ...s }));
  }
}
