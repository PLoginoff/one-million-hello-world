/**
 * AggregateRepository — load/save aggregates against EventStorage.
 *
 * Responsibilities:
 *   - Rehydrate an aggregate by replaying its event stream (optionally
 *     seeded from a snapshot + event tail).
 *   - Persist pending events with optimistic concurrency: the aggregate's
 *     loaded version becomes the `expectedVersion` for the append. If
 *     another writer committed first, `ConcurrencyError` bubbles up.
 *   - Enforce invariants BEFORE saving: an aggregate with pending
 *     violations cannot be committed.
 *   - Opportunistically snapshot: every N events the repository calls
 *     `snapshotState()` and stores the result to bound replay cost.
 *
 * The repository is typed on the aggregate class; callers provide a
 * `factory` that constructs an empty instance for rehydration.
 *
 * @module WriteModelLayer/Implementations
 */

import {
  AggregateRoot,
  AggregateSnapshot,
  DomainEvent,
  EventEnvelope,
} from './AggregateRoot';
import {
  AppendEventInput,
  ConcurrencyError,
  EventStorage,
} from './EventStorage';

// ------------------------------------------------------------------ types

/** Error thrown when an aggregate has uncommitted invariant violations. */
export class InvariantViolationError extends Error {
  readonly aggregateId: string;
  readonly violations: readonly string[];
  constructor(aggregateId: string, violations: readonly string[]) {
    super(
      `Aggregate '${aggregateId}' has invariant violations: ${violations.join('; ')}`,
    );
    this.name = 'InvariantViolationError';
    this.aggregateId = aggregateId;
    this.violations = violations;
  }
}

/** Aggregate factory — returns an empty instance ready for rehydration. */
export type AggregateFactory<T extends AggregateRoot> = (id: string) => T;

/** Repository options. */
export interface RepositoryOptions {
  /** Snapshot every N events per aggregate. 0 disables. */
  readonly snapshotFrequency?: number;
  /** Include correlation metadata in event envelopes. */
  readonly defaultMetadata?: Record<string, unknown>;
}

// ------------------------------------------------------------ repository

export class AggregateRepository<T extends AggregateRoot> {
  private readonly _store: EventStorage;
  private readonly _factory: AggregateFactory<T>;
  private readonly _aggregateType: string;
  private readonly _snapshotFrequency: number;
  private readonly _defaultMetadata: Record<string, unknown>;

  constructor(
    store: EventStorage,
    aggregateType: string,
    factory: AggregateFactory<T>,
    options: RepositoryOptions = {},
  ) {
    this._store = store;
    this._aggregateType = aggregateType;
    this._factory = factory;
    this._snapshotFrequency = options.snapshotFrequency ?? 0;
    this._defaultMetadata = options.defaultMetadata ?? {};
  }

  /**
   * Load an aggregate by id. If a snapshot exists and the aggregate
   * supports snapshots, seed from it and replay only the event tail.
   * Returns `undefined` for a non-existent aggregate.
   */
  async load(id: string): Promise<T | undefined> {
    const version = this._store.streamVersion(this._aggregateType, id);
    if (version === 0) return undefined;

    const aggregate = this._factory(id);

    // Try snapshot-assisted load.
    const snapshot = this._store.loadSnapshot(this._aggregateType, id);
    if (snapshot && aggregate.supportsSnapshots) {
      const tail = this._store.readStream(this._aggregateType, id, {
        fromVersion: snapshot.version + 1,
      });
      aggregate.loadFromSnapshot(snapshot, tail);
      return aggregate;
    }

    // Full replay.
    const events = this._store.readStream(this._aggregateType, id);
    aggregate.loadFromHistory(events);
    return aggregate;
  }

  /**
   * Save an aggregate's pending events with optimistic concurrency.
   *
   * Throws:
   *   - InvariantViolationError if `aggregate.violations` is non-empty
   *   - ConcurrencyError if the stream version moved since load
   *
   * @param metadata optional per-save metadata merged over defaults.
   */
  async save(aggregate: T, metadata: Record<string, unknown> = {}): Promise<number> {
    if (aggregate.violations.length > 0) {
      throw new InvariantViolationError(aggregate.id, aggregate.violations);
    }
    const pending = aggregate.drainPendingEvents();
    if (pending.length === 0) {
      return aggregate.version;
    }

    const inputs: AppendEventInput[] = pending.map((e: DomainEvent) => ({
      type: e.type,
      data: e.data,
      metadata: { ...this._defaultMetadata, ...metadata },
    }));

    const appended = this._store.append(
      this._aggregateType,
      aggregate.id,
      aggregate.version, // optimistic concurrency: must equal loaded version
      inputs,
    );
    const newVersion = appended[appended.length - 1]?.aggregateVersion ?? aggregate.version;
    aggregate.markCommitted(newVersion);

    // Opportunistic snapshot when we cross a frequency boundary.
    if (this._snapshotFrequency > 0 && aggregate.supportsSnapshots) {
      const prevBucket = Math.floor((newVersion - appended.length) / this._snapshotFrequency);
      const newBucket = Math.floor(newVersion / this._snapshotFrequency);
      if (newBucket > prevBucket) {
        const state = aggregate.snapshotState();
        if (state !== undefined) {
          this._store.saveSnapshot({
            aggregateId: aggregate.id,
            aggregateType: this._aggregateType,
            version: newVersion,
            state,
            takenAt: Date.now(),
          });
        }
      }
    }

    return newVersion;
  }

  /**
   * Load-or-create: returns the existing aggregate or a fresh one if the
   * stream doesn't exist.
   */
  async loadOrCreate(id: string): Promise<T> {
    const existing = await this.load(id);
    return existing ?? this._factory(id);
  }

  /** True iff the aggregate exists. */
  exists(id: string): boolean {
    return this._store.streamExists(this._aggregateType, id);
  }

  /** Current committed version for an aggregate (0 = doesn't exist). */
  version(id: string): number {
    return this._store.streamVersion(this._aggregateType, id);
  }

  /** Underlying event storage (for projections / diagnostics). */
  get storage(): EventStorage {
    return this._store;
  }
}

