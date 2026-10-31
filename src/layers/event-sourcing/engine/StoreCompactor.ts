/**
 * StoreCompactor — segment merge + snapshot-aware truncation.
 *
 * Two distinct maintenance jobs share one pass (both rewrite segments,
 * so doing them together halves the I/O):
 *
 *   1. Segment merge. Appends produce a tail of small segments; over
 *      time a shard accumulates thousands of tiny files. Merging
 *      concatenates adjacent sealed segments into runs of
 *      `targetSegmentSize` — fewer handles, fewer checksums to verify,
 *      faster full-shard scans.
 *
 *   2. Snapshot-aware truncation ("drop superseded events"). Once a
 *      snapshot captures stream state at version V, events of that
 *      stream at versions <= V cannot change the folded result — they
 *      are only needed for point-in-time rebuilds, which retention
 *      policy may not require. Dropping them is what makes event logs
 *      bounded in practice (Kafka calls this log compaction's cousin:
 *      time/size-based retention).
 *
 * Safety rules:
 *   - Only events strictly below `floorVersion(streamId)` are dropped,
 *     and only when a snapshot actually covers them — the caller passes
 *     floors from `SnapshotStore.latestAtOrBefore`. No floor, no drop.
 *   - The newest event of a stream is never dropped even if a snapshot
 *     covers it: keeping v=V guarantees `streamVersion()` survives
 *     truncation and optimistic concurrency still has an anchor.
 *   - Rewritten shards are re-chained (per-event `checksum`) and
 *     re-numbered (contiguous `shardPosition`) — compaction output is
 *     indistinguishable from a freshly-written log to verifiers and
 *     replicas.
 *   - Tombstones: dropped ranges leave a `TruncationMarker` per stream
 *     so readers know [0, floor) is *gone*, not "never existed" — the
 *     difference matters for audit and point-in-time queries.
 *
 * Complexity: one pass over the shard's events, O(n) time, O(n) output
 * space (the new segment list). Old segments are replaced atomically at
 * `storage.replaceSegments` — readers either see the old set or the new.
 *
 * @module EventSourcing/Engine
 */

import {
  ShardedEventStore,
  ShardedStoredEvent,
  EventSegment,
  ShardStorageAdapter,
  segmentChecksum,
} from './ShardedEventStore';
import { chainHash } from './Sharding';
import { IClock, SystemClock } from '../../observability/engine/signals';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

/**
 * Records that events [0, floorExclusive) of `streamId` were truncated
 * after a snapshot made them superseded. Readers hitting a gap should
 * look up the snapshot, not assume data loss.
 */
export interface TruncationMarker {
  readonly streamId: string;
  readonly shardId: string;
  /** First surviving stream version (== snapshot version + 1 unless the
   *  snapshot-version event itself was kept as anchor). */
  readonly firstSurvivingVersion: number;
  /** How many events were dropped. */
  readonly droppedCount: number;
  readonly truncatedAt: number;
}

export interface CompactOptions {
  /** Concatenate sealed segments until each output segment approaches
   *  this many events. 0 disables merging. */
  mergeToSegmentSize?: number;
  /** streamId -> version V: events with streamVersion < V are droppable
   *  (a snapshot at V supersedes them). Missing entry = keep everything. */
  streamFloors?: ReadonlyMap<string, number>;
}

export interface CompactReport {
  readonly shardId: string;
  readonly segmentsBefore: number;
  readonly segmentsAfter: number;
  readonly eventsBefore: number;
  readonly eventsAfter: number;
  readonly eventsDropped: number;
  readonly markers: TruncationMarker[];
  /** Output segments' checksums — feed straight into the verifier. */
  readonly segmentChecksums: { id: string; checksum: number }[];
}

// ---------------------------------------------------------------------
// Compactor
// ---------------------------------------------------------------------

export class StoreCompactor {
  private readonly _store: ShardedEventStore;
  private readonly _clock: IClock;
  private readonly _markers = new Map<string, TruncationMarker[]>();

  constructor(store: ShardedEventStore, clock: IClock = new SystemClock()) {
    this._store = store;
    this._clock = clock;
  }

  /** Truncation markers per shard (accumulated across compactions). */
  markers(shardId: string): readonly TruncationMarker[] {
    return this._markers.get(shardId) ?? [];
  }

  /** Marker for a specific stream (point-in-time read support). */
  markerFor(streamId: string): TruncationMarker | undefined {
    for (const list of this._markers.values()) {
      const m = list.find((x) => x.streamId === streamId);
      if (m) return m;
    }
    return undefined;
  }

  /**
   * Compact one shard. The pipeline:
   *
   *   scan all events (shard order)
   *     → drop events below their stream's floor (keeping the anchor)
   *     → renumber + re-chain survivors
   *     → pack into output segments of ~mergeToSegmentSize
   *     → replace storage, refresh the store's stream index
   */
  compactShard(shardId: string, options: CompactOptions = {}): CompactReport {
    const storage = this._store.storage;
    const segs = storage.segments(shardId);
    const before = segs.reduce((n, s) => n + s.size, 0);
    const floors = options.streamFloors ?? new Map<string, number>();
    const mergeSize = Math.max(0, options.mergeToSegmentSize ?? 0);

    // ---- pass 1: per-stream survivor sets ------------------------------
    // Group events by stream (single pass), then per stream decide which
    // events survive: all events >= floor plus ONE anchor — the last
    // event below floor — so streamVersion continuity survives.
    const byStream = new Map<string, ShardedStoredEvent[]>();
    for (const seg of segs) {
      for (const e of seg.events) {
        let list = byStream.get(e.streamId);
        if (!list) {
          list = [];
          byStream.set(e.streamId, list);
        }
        list.push(e);
      }
    }

    const markers: TruncationMarker[] = [];
    const keepIds = new Set<string>();
    let dropped = 0;
    for (const [streamId, events] of byStream) {
      const floor = floors.get(streamId);
      if (floor === undefined || floor <= 0) {
        for (const e of events) keepIds.add(e.id);
        continue;
      }
      let anchor: ShardedStoredEvent | null = null;
      for (const e of events) {
        if (e.streamVersion >= floor) keepIds.add(e.id);
        else anchor = e; // events are stream-ordered; last below wins
      }
      if (anchor) keepIds.add(anchor.id);
      let streamDropped = 0;
      for (const e of events) if (!keepIds.has(e.id)) streamDropped++;
      if (streamDropped > 0) {
        dropped += streamDropped;
        const firstKept = events.find((e) => keepIds.has(e.id));
        markers.push({
          streamId,
          shardId,
          firstSurvivingVersion: firstKept ? firstKept.streamVersion : floor,
          droppedCount: streamDropped,
          truncatedAt: this._clock.nowMs(),
        });
      }
    }

    // ---- pass 2: renumber + re-chain ----------------------------------
    // Flatten in original shard order, skipping dropped events, then
    // renumber contiguously and re-chain checksums — output is
    // indistinguishable from a freshly written log.
    const flat: ShardedStoredEvent[] = [];
    for (const seg of segs) {
      for (const e of seg.events) {
        if (keepIds.has(e.id)) flat.push(e);
      }
    }

    let running = 0;
    const renumbered: ShardedStoredEvent[] = flat.map((e, i) => {
      const checksum = chainHash(running, e.contentHash);
      running = checksum;
      return { ...e, shardPosition: i, globalPosition: i, checksum };
    });

    // ---- pass 3: pack into output segments -----------------------------
    const outSegs: EventSegment[] = [];
    if (renumbered.length) {
        const pack =
          mergeSize > 0
            ? mergeSize
            : Math.max(1, segs[segs.length - 1]?.size ?? renumbered.length);
      let idx = 0;
      let segIdx = 0;
      while (idx < renumbered.length) {
        const take = Math.min(pack, renumbered.length - idx);
        const seg = new EventSegment(shardId, segIdx++, renumbered[idx].shardPosition);
        for (let i = 0; i < take; i++) seg.events.push(renumbered[idx + i]);
        seg.checksum = segmentChecksum(seg.events);
        seg.sealed = idx + take < renumbered.length; // last stays active
        if (seg.sealed) seg.sealedAt = this._clock.nowMs();
        outSegs.push(seg);
        idx += take;
      }
    }

    storage.replaceSegments(shardId, outSegs);
    this._store.reindexShard(shardId, renumbered);

    // Accumulate markers.
    if (markers.length) {
      const list = this._markers.get(shardId) ?? [];
      // One marker per stream — replace any older marker for it.
      for (const m of markers) {
        const i = list.findIndex((x) => x.streamId === m.streamId);
        if (i >= 0) list[i] = m;
        else list.push(m);
      }
      this._markers.set(shardId, list);
    }

    return {
      shardId,
      segmentsBefore: segs.length,
      segmentsAfter: outSegs.length,
      eventsBefore: before,
      eventsAfter: renumbered.length,
      eventsDropped: dropped,
      markers,
      segmentChecksums: outSegs.map((s) => ({ id: s.id, checksum: s.checksum })),
    };
  }

  /**
   * Compact every shard — convenience for scheduled maintenance.
   */
  compactAll(options: CompactOptions = {}): CompactReport[] {
    const reports: CompactReport[] = [];
    for (const shardId of this._store.shardMap.shardIds()) {
      reports.push(this.compactShard(shardId, options));
    }
    return reports;
  }
}
