/**
 * SnapshotStore — versioned snapshot persistence for event-sourced aggregates.
 *
 * Complements `EventStore` (implementations/EventStore.ts), which keeps only
 * ONE in-memory snapshot per stream. This store keeps a full history of
 * snapshots per stream, persisted as serialized envelopes:
 *
 *   - Every snapshot carries a `snapshotSchemaVersion` so old state shapes
 *     survive model changes (see SnapshotSerializer for migrations).
 *   - `latest()` is O(1): each stream keeps a descending-version list.
 *   - `garbageCollect(keepLast)` prunes history — for streams that snapshot
 *     often, unbounded history would grow linearly forever.
 *   - `pruneBelow(version)` supports log truncation: once events older than
 *     V are archived/dropped, snapshots below V are useless.
 *
 * The store is dumb about *when* to snapshot — that's SnapshotScheduler.
 *
 * @module EventSourcing/Engine
 */

import { Snapshot } from '../implementations/EventStore';
import { IClock, SystemClock } from '../../observability/engine/signals';

/** Serialized form of a snapshot — the only thing actually stored. */
export interface SnapshotRecord {
  readonly streamId: string;
  readonly streamVersion: number;
  /** Version of the *state shape*, not the stream. Bump when the aggregate's
   *  folded-state schema changes. */
  readonly snapshotSchemaVersion: number;
  /** JSON-encoded state. */
  readonly stateJson: string;
  readonly takenAt: number;
}

export class SnapshotSerializationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SnapshotSerializationError';
  }
}

export class SnapshotStore {
  /** streamId -> records ordered by ascending streamVersion. */
  private readonly _records = new Map<string, SnapshotRecord[]>();

  /**
   * Persist a record. Out-of-order writes are allowed (a rebuild may write
   * an older-version snapshot after newer ones) and inserted sorted, so
   * `latest()` always returns the highest streamVersion.
   * Complexity: O(log n) search + O(n) insert — histories stay small (tens).
   */
  save(record: SnapshotRecord): void {
    let list = this._records.get(record.streamId);
    if (!list) {
      list = [];
      this._records.set(record.streamId, list);
    }
    // Binary search for insertion point by streamVersion.
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].streamVersion < record.streamVersion) lo = mid + 1;
      else hi = mid;
    }
    // Replace an existing record at the same version (re-snapshot idempotent).
    if (lo < list.length && list[lo].streamVersion === record.streamVersion) {
      list[lo] = record;
    } else {
      list.splice(lo, 0, record);
    }
  }

  /** Most recent snapshot for a stream, or null. O(1). */
  latest(streamId: string): SnapshotRecord | null {
    const list = this._records.get(streamId);
    return list && list.length ? list[list.length - 1] : null;
  }

  /** Most recent snapshot taken at or before `streamVersion` — used when
   *  rebuilding to a point in time. O(log n). */
  latestAtOrBefore(streamId: string, streamVersion: number): SnapshotRecord | null {
    const list = this._records.get(streamId);
    if (!list || !list.length) return null;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].streamVersion <= streamVersion) lo = mid + 1;
      else hi = mid;
    }
    return lo === 0 ? null : list[lo - 1];
  }

  /** All snapshots for a stream, ascending by streamVersion. */
  history(streamId: string): SnapshotRecord[] {
    return [...(this._records.get(streamId) ?? [])];
  }

  /**
   * Garbage collection: keep only the newest `keepLast` snapshots per stream.
   * Returns the number of records dropped.
   */
  garbageCollect(keepLast: number): number {
    if (keepLast < 1) throw new Error('keepLast must be >= 1');
    let dropped = 0;
    for (const [streamId, list] of this._records) {
      if (list.length > keepLast) {
        dropped += list.length - keepLast;
        this._records.set(streamId, list.slice(-keepLast));
      }
    }
    return dropped;
  }

  /**
   * Drop every snapshot strictly below `streamVersion` for a stream.
   * Call this after truncating the event log — the snapshots can no longer
   * be combined with replayed events.
   */
  pruneBelow(streamId: string, streamVersion: number): number {
    const list = this._records.get(streamId);
    if (!list) return 0;
    const kept = list.filter((r) => r.streamVersion >= streamVersion);
    const dropped = list.length - kept.length;
    if (kept.length) this._records.set(streamId, kept);
    else this._records.delete(streamId);
    return dropped;
  }

  deleteStream(streamId: string): boolean {
    return this._records.delete(streamId);
  }

  streamIds(): string[] {
    return [...this._records.keys()];
  }

  count(streamId?: string): number {
    if (streamId !== undefined) return this._records.get(streamId)?.length ?? 0;
    let n = 0;
    for (const l of this._records.values()) n += l.length;
    return n;
  }
}

/**
 * SnapshotSerializer — converts in-memory `Snapshot<TState>` to/from
 * `SnapshotRecord`, with schema-versioned migrations.
 *
 * When an aggregate's state shape changes, bump `currentSchemaVersion` and
 * register a migrator for the OLD version: `migrate(v1record) -> v2record`.
 * Migrations chain (v1 -> v2 -> v3) the same way EventStore upcasters do.
 *
 * A snapshot with an unknown schemaVersion and no migrator is dropped on
 * `load()` (returns null) rather than crashing the rehydration — the caller
 * then falls back to full event replay, which is always correct.
 */
export type SnapshotMigrator = (stateJson: string) => string;

export class SnapshotSerializer {
  private readonly _currentVersion: number;
  private readonly _migrators = new Map<number, SnapshotMigrator>();
  private readonly _clock: IClock;

  constructor(currentSchemaVersion = 1, clock: IClock = new SystemClock()) {
    this._currentVersion = currentSchemaVersion;
    this._clock = clock;
  }

  get currentSchemaVersion(): number {
    return this._currentVersion;
  }

  /** Register a migrator that upgrades a snapshot from `fromVersion` to
   *  `fromVersion + 1`. */
  registerMigrator(fromVersion: number, migrator: SnapshotMigrator): void {
    this._migrators.set(fromVersion, migrator);
  }

  /** Snapshot -> storable record (JSON-encoded at current schema version). */
  serialize<TState>(snapshot: Snapshot<TState>): SnapshotRecord {
    let stateJson: string;
    try {
      stateJson = JSON.stringify(snapshot.state);
    } catch (e) {
      throw new SnapshotSerializationError(
        `snapshot state for '${snapshot.streamId}' is not JSON-serializable: ` +
          (e instanceof Error ? e.message : String(e))
      );
    }
    return {
      streamId: snapshot.streamId,
      streamVersion: snapshot.streamVersion,
      snapshotSchemaVersion: this._currentVersion,
      stateJson,
      takenAt: snapshot.takenAt,
    };
  }

  /**
   * Record -> typed snapshot, applying chained migrations if the record is
   * older than the current schema version. Returns null when the record
   * cannot be migrated to the current version (missing migrator, bad JSON,
   * newer-than-known version).
   */
  deserialize<TState>(record: SnapshotRecord): Snapshot<TState> | null {
    if (record.snapshotSchemaVersion > this._currentVersion) return null;

    let json = record.stateJson;
    let version = record.snapshotSchemaVersion;
    // Bounded chained migration (100 hops max, same as EventStore upcasters).
    for (let i = 0; i < 100 && version < this._currentVersion; i++) {
      const migrator = this._migrators.get(version);
      if (!migrator) return null;
      try {
        json = migrator(json);
      } catch {
        return null;
      }
      version++;
    }
    if (version !== this._currentVersion) return null;

    try {
      return {
        streamId: record.streamId,
        streamVersion: record.streamVersion,
        state: JSON.parse(json) as TState,
        takenAt: record.takenAt,
      };
    } catch {
      return null;
    }
  }

  /** Convenience: serialize + save in one call. */
  saveSnapshot<TState>(store: SnapshotStore, snapshot: Snapshot<TState>): SnapshotRecord {
    const record = this.serialize(snapshot);
    store.save(record);
    return record;
  }

  /** Convenience: latest record + migrate + deserialize; null if unusable. */
  loadLatest<TState>(store: SnapshotStore, streamId: string): Snapshot<TState> | null {
    const record = store.latest(streamId);
    if (!record) return null;
    return this.deserialize<TState>(record);
  }
}
