/**
 * SnapshotMaintenance — housekeeping for the snapshot store.
 *
 * Periodic tasks typically run by a cron/worker:
 *
 *   - `collectGarbage(keepLast)`: keep only the newest N snapshots per
 *     stream (delegates to SnapshotStore.garbageCollect).
 *   - `report()`: per-stream and global stats — snapshot counts, oldest
 *     retained version, estimated retained bytes, streams that have never
 *     been snapshotted despite having events (scheduler gap detection).
 *   - `streamsMissingSnapshots()`: streams with >= minEvents events and no
 *     snapshot — the ones a scheduler run should prioritize.
 *
 * @module EventSourcing/Engine
 */

import { EventStore } from '../implementations/EventStore';
import { SnapshotStore } from './SnapshotStore';
import { SnapshotScheduler } from './SnapshotScheduler';

export interface StreamSnapshotInfo {
  readonly streamId: string;
  readonly snapshots: number;
  /** streamVersion covered by the newest snapshot; -1 if none. */
  readonly latestVersion: number;
  /** streamVersion covered by the oldest retained snapshot; -1 if none. */
  readonly oldestVersion: number;
  /** Approx bytes of retained snapshot records. */
  readonly retainedBytes: number;
  /** Events accumulated since last confirmed snapshot (scheduler view). */
  readonly eventsSinceSnapshot: number;
  readonly snapshotDue: boolean;
}

export class SnapshotMaintenance {
  private readonly _store: EventStore;
  private readonly _snapshots: SnapshotStore;
  private readonly _scheduler: SnapshotScheduler | null;

  constructor(store: EventStore, snapshots: SnapshotStore, scheduler: SnapshotScheduler | null = null) {
    this._store = store;
    this._snapshots = snapshots;
    this._scheduler = scheduler;
  }

  /** Keep the newest `keepLast` snapshots per stream; returns dropped count. */
  collectGarbage(keepLast: number): number {
    return this._snapshots.garbageCollect(keepLast);
  }

  /** Per-stream snapshot stats. */
  report(): StreamSnapshotInfo[] {
    const out: StreamSnapshotInfo[] = [];
    for (const streamId of this._snapshots.streamIds()) {
      const hist = this._snapshots.history(streamId);
      const progress = this._scheduler?.progress(streamId) ?? {
        lastSnapshotVersion: -1,
        eventsSince: 0,
        bytesSince: 0,
      };
      out.push({
        streamId,
        snapshots: hist.length,
        latestVersion: hist.length ? hist[hist.length - 1].streamVersion : -1,
        oldestVersion: hist.length ? hist[0].streamVersion : -1,
        retainedBytes: hist.reduce((a, r) => a + r.stateJson.length + 64, 0),
        eventsSinceSnapshot: progress.eventsSince,
        snapshotDue: this._scheduler?.isDue(streamId) ?? false,
      });
    }
    // Most-lagged first — the ones rehydration would benefit from most.
    out.sort((a, b) => b.eventsSinceSnapshot - a.eventsSinceSnapshot);
    return out;
  }

  /**
   * Streams that have at least `minEvents` events but no snapshot at all —
   * cold spots a warm-up pass should cover.
   * Requires a list of candidate streamIds (the EventStore doesn't expose
   * enumeration; pass the ids you manage).
   */
  streamsMissingSnapshots(streamIds: readonly string[], minEvents = 50): string[] {
    const missing: string[] = [];
    for (const id of streamIds) {
      const events = this._store.streamVersion(id) + 1;
      if (events >= minEvents && this._snapshots.latest(id) === null) {
        missing.push(id);
      }
    }
    return missing;
  }
}
