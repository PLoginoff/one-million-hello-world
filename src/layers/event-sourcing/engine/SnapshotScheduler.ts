/**
 * SnapshotScheduler — decides WHEN to take snapshots.
 *
 * Two independent triggers, either of which is enough:
 *
 *   1. Event-count: every N appended events per stream (classic policy).
 *   2. Byte-size: when the events appended since the last snapshot exceed
 *      `maxBytesSinceSnapshot` — catches streams whose events are large
 *      (file metadata, rich payloads) even if they're few.
 *
 * The scheduler does NOT take snapshots itself: `eventsAppended()` records
 * activity and returns `true` when a snapshot is due; the caller then
 * performs the fold + save (see AggregateRehydrator.snapshotNow()).
 *
 * Tracking "since last snapshot": each stream keeps
 * `{ lastSnapshotVersion, eventsSince, bytesSince }`. When the caller
 * confirms the snapshot was stored (`confirmSnapshot(streamId, version)`),
 * the counters reset. If the snapshot write fails, counters keep
 * accumulating and the scheduler stays "due" — retry-safe.
 *
 * Sizing: JSON.stringify of the event data is a decent byte proxy — cheap,
 * no Buffer needed. Exactness doesn't matter (policy trigger, not billing).
 *
 * @module EventSourcing/Engine
 */

import { StoredEvent } from '../implementations/EventStore';

export interface SnapshotPolicy {
  /** Snapshot after this many events since the last one. 0 disables. */
  readonly everyNEvents?: number;
  /** Snapshot when accumulated event bytes since last snapshot exceed this. 0 disables. */
  readonly maxBytesSinceSnapshot?: number;
  /** Minimum events before the FIRST snapshot — avoids snapshotting
   *  streams that will never grow. Default 1. */
  readonly minEventsBeforeFirst?: number;
}

interface StreamProgress {
  /** streamVersion of the last confirmed snapshot; -1 = none yet. */
  lastSnapshotVersion: number;
  eventsSince: number;
  bytesSince: number;
}

export class SnapshotScheduler {
  private readonly _everyN: number;
  private readonly _maxBytes: number;
  private readonly _minFirst: number;
  private readonly _progress = new Map<string, StreamProgress>();

  constructor(policy: SnapshotPolicy = {}) {
    this._everyN = policy.everyNEvents ?? 100;
    this._maxBytes = policy.maxBytesSinceSnapshot ?? 0;
    this._minFirst = Math.max(1, policy.minEventsBeforeFirst ?? 1);
  }

  /**
   * Record newly appended events for a stream.
   * @returns true when a snapshot should be taken now.
   */
  eventsAppended(streamId: string, events: readonly StoredEvent[]): boolean {
    if (events.length === 0) return this.isDue(streamId);
    let p = this._progress.get(streamId);
    if (!p) {
      p = { lastSnapshotVersion: -1, eventsSince: 0, bytesSince: 0 };
      this._progress.set(streamId, p);
    }
    p.eventsSince += events.length;
    for (const e of events) {
      p.bytesSince += eventSizeBytes(e);
    }
    return this.isDue(streamId);
  }

  /** Is a snapshot currently due for this stream? */
  isDue(streamId: string): boolean {
    const p = this._progress.get(streamId);
    if (!p) return false;

    const noSnapshotYet = p.lastSnapshotVersion === -1;
    if (noSnapshotYet && p.eventsSince < this._minFirst) return false;

    if (this._everyN > 0 && p.eventsSince >= this._everyN) return true;
    if (this._maxBytes > 0 && p.bytesSince >= this._maxBytes) return true;
    return false;
  }

  /**
   * Call after the snapshot has been successfully persisted.
   * Resets the counters relative to the snapshot's streamVersion.
   */
  confirmSnapshot(streamId: string, streamVersion: number): void {
    let p = this._progress.get(streamId);
    if (!p) {
      p = { lastSnapshotVersion: streamVersion, eventsSince: 0, bytesSince: 0 };
      this._progress.set(streamId, p);
      return;
    }
    p.lastSnapshotVersion = Math.max(p.lastSnapshotVersion, streamVersion);
    p.eventsSince = 0;
    p.bytesSince = 0;
  }

  /** Counters for diagnostics (e.g. "events since last snapshot" gauges). */
  progress(streamId: string): { lastSnapshotVersion: number; eventsSince: number; bytesSince: number } {
    const p = this._progress.get(streamId);
    return p
      ? { lastSnapshotVersion: p.lastSnapshotVersion, eventsSince: p.eventsSince, bytesSince: p.bytesSince }
      : { lastSnapshotVersion: -1, eventsSince: 0, bytesSince: 0 };
  }

  /** Forget a stream (aggregate deleted). */
  reset(streamId: string): void {
    this._progress.delete(streamId);
  }
}

/** Rough serialized size of a stored event — data + type, bytes ≈ UTF-8 chars. */
export function eventSizeBytes(event: StoredEvent): number {
  let n: number;
  try {
    n = JSON.stringify(event.data)?.length ?? 0;
  } catch {
    n = 0;
  }
  return n + event.type.length + 32; // 32 ~ fixed envelope overhead
}
