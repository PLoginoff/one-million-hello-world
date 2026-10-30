/**
 * AggregateRehydrator — load an aggregate state using the snapshot shortcut.
 *
 * Without snapshots, rebuilding an aggregate costs O(V) — every event from
 * version 0 must be folded. With a snapshot at version S, cost drops to
 * O(V - S) — only the tail after the snapshot is replayed.
 *
 *   load(streamId, initial, fold)
 *       ├─ serializer.loadLatest() → snapshot?      (O(1))
 *       ├─ store.readStream(from = snap.version+1)  (tail only)
 *       ├─ fold each event into snapshot state
 *       └─ no snapshot → fold everything from `initial`
 *
 * Robustness: if the stored snapshot can't be deserialized/migrated
 * (schema change without migrator, corrupted JSON), `load()` falls back to
 * full replay automatically — an unmigratable snapshot is only ever a
 * performance problem, never a correctness one.
 *
 * `snapshotNow()` builds a fresh snapshot by folding the full stream (the
 * EventStore already provides buildSnapshot) and persists it through the
 * versioned serializer — so the scheduler/serializer/store stay decoupled.
 *
 * @module EventSourcing/Engine
 */

import { EventStore, Snapshot, StoredEvent } from '../implementations/EventStore';
import { SnapshotSerializer, SnapshotStore } from './SnapshotStore';
import { SnapshotScheduler } from './SnapshotScheduler';
import { IClock, SystemClock } from '../../observability/engine/signals';

/** What happened during a load — useful for metrics and tests. */
export interface RehydrationResult<TState> {
  readonly state: TState;
  /** Stream version the state reflects (-1 = stream does not exist). */
  readonly streamVersion: number;
  /** Snapshot used as the base, if any. */
  readonly snapshotUsed: Snapshot<TState> | null;
  /** Number of events folded on top of the base (tail replay). */
  readonly eventsReplayed: number;
  /** 'snapshot+tail' | 'full-replay' | 'empty' */
  readonly path: 'snapshot+tail' | 'full-replay' | 'empty';
}

export class AggregateRehydrator {
  private readonly _store: EventStore;
  private readonly _snapshots: SnapshotStore;
  private readonly _serializer: SnapshotSerializer;
  private readonly _scheduler: SnapshotScheduler | null;
  private readonly _clock: IClock;

  constructor(
    store: EventStore,
    snapshots: SnapshotStore,
    serializer: SnapshotSerializer,
    scheduler: SnapshotScheduler | null = null,
    clock: IClock = new SystemClock()
  ) {
    this._store = store;
    this._snapshots = snapshots;
    this._serializer = serializer;
    this._scheduler = scheduler;
    this._clock = clock;
  }

  /**
   * Rebuild an aggregate's state with the snapshot shortcut.
   *
   * @param streamId stream to load
   * @param initial  seed state when no snapshot exists
   * @param fold     pure state transition: (state, event) -> state
   */
  load<TState>(
    streamId: string,
    initial: TState,
    fold: (state: TState, event: StoredEvent) => TState
  ): RehydrationResult<TState> {
    const currentVersion = this._store.streamVersion(streamId);
    if (currentVersion === -1) {
      return { state: initial, streamVersion: -1, snapshotUsed: null, eventsReplayed: 0, path: 'empty' };
    }

    const snapshot = this._serializer.loadLatest<TState>(this._snapshots, streamId);

    if (!snapshot) {
      // Cold path: fold the entire stream.
      let state = initial;
      let replayed = 0;
      for (const e of this._store.readStream(streamId)) {
        state = fold(state, e);
        replayed++;
      }
      return { state, streamVersion: currentVersion, snapshotUsed: null, eventsReplayed: replayed, path: 'full-replay' };
    }

    // Hot path: fold only events strictly after the snapshot version.
    // A snapshot taken AFTER currentVersion (e.g. stale store) is guarded
    // against: readStream would return [] and we trust the snapshot.
    let state = snapshot.state;
    let replayed = 0;
    for (const e of this._store.readStream(streamId, { fromVersion: snapshot.streamVersion + 1 })) {
      state = fold(state, e);
      replayed++;
    }
    return { state, streamVersion: currentVersion, snapshotUsed: snapshot, eventsReplayed: replayed, path: 'snapshot+tail' };
  }

  /**
   * Record newly appended events: feeds the scheduler (if configured) and
   * takes the snapshot immediately when due.
   * @returns the stored snapshot record, or null when not due.
   */
  eventsAppended<TState>(
    streamId: string,
    events: readonly StoredEvent[],
    initial: TState,
    fold: (state: TState, event: StoredEvent) => TState
  ) {
    if (!this._scheduler) return null;
    const due = this._scheduler.eventsAppended(streamId, events);
    if (!due) return null;
    return this.snapshotNow(streamId, initial, fold);
  }

  /**
   * Build + persist a snapshot for a stream right now (folds the full
   * stream once — the expensive part of snapshotting, amortized).
   */
  snapshotNow<TState>(
    streamId: string,
    initial: TState,
    fold: (state: TState, event: StoredEvent) => TState
  ) {
    const snapshot = this._store.buildSnapshot<TState>(streamId, initial, fold);
    const record = this._serializer.serialize(snapshot);
    this._snapshots.save(record);
    this._scheduler?.confirmSnapshot(streamId, snapshot.streamVersion);
    return record;
  }

  /** Rebuild to a past version: snapshot at-or-before V + tail to V. */
  loadAt<TState>(
    streamId: string,
    atVersion: number,
    initial: TState,
    fold: (state: TState, event: StoredEvent) => TState
  ): RehydrationResult<TState> {
    const baseRecord = this._snapshots.latestAtOrBefore(streamId, atVersion);
    const base = baseRecord ? this._serializer.deserialize<TState>(baseRecord) : null;

    let state: TState;
    let from: number;
    let snapshotUsed: Snapshot<TState> | null = null;
    if (base) {
      state = base.state;
      from = base.streamVersion + 1;
      snapshotUsed = base;
    } else {
      state = initial;
      from = 0;
    }

    let replayed = 0;
    let lastVersion = base ? base.streamVersion : -1;
    for (const e of this._store.readStream(streamId, { fromVersion: from })) {
      if (e.streamVersion > atVersion) break;
      state = fold(state, e);
      replayed++;
      lastVersion = e.streamVersion;
    }
    return {
      state,
      streamVersion: lastVersion,
      snapshotUsed,
      eventsReplayed: replayed,
      path: snapshotUsed ? 'snapshot+tail' : (replayed ? 'full-replay' : 'empty'),
    };
  }
}
