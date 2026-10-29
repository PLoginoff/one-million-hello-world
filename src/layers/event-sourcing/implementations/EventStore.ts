/**
 * Event Store Engine
 *
 * A real append-only event store with:
 * - Per-aggregate event streams with monotonic version numbers
 * - Optimistic concurrency control via expected-version checks
 * - Snapshot support (write every N events; load = snapshot + tail replay)
 * - Global event log with position-based replay
 * - Subscriptions for live + catch-up projection building
 * - Upcasting: registered migrators transform old event versions on read
 * - Serialization envelope with metadata (correlation / causation / actor)
 *
 * Storage layout (in-memory):
 * - `_global`: array of all committed events in commit order (the log position)
 * - `_streams`: aggregateId -> array of committed events (stream order)
 * - `_snapshots`: aggregateId -> latest snapshot
 * - `_archive`: durable serialized form (simulates on-disk records)
 *
 * Complexity notes:
 * - appendToStream: O(k) where k = events appended; version check O(1)
 * - readStream: O(n) with optional range slicing
 * - Concurrency conflict detection relies on a synchronous commit section,
 *   which is atomic in a single-threaded JS runtime.
 *
 * @module EventSourcingLayer/Implementations
 */

// ============================================================================
// Types
// ============================================================================

/** Metadata attached to every stored event. */
export interface EventMetadata {
  /** Correlates all events caused by a single external request. */
  readonly correlationId?: string;
  /** Id of the event/command that directly caused this one. */
  readonly causationId?: string;
  /** Actor / principal that produced the event. */
  readonly actor?: string;
  /** Free-form extra metadata. */
  readonly [key: string]: unknown;
}

/** An event as supplied by the caller (pre-commit). */
export interface NewEvent<TPayload = unknown> {
  /** Event type name, e.g. `OrderCreated`. */
  readonly type: string;
  /** Schema version of `data`. Default: 1. */
  readonly schemaVersion?: number;
  readonly data: TPayload;
  readonly metadata?: EventMetadata;
}

/** A committed event — the unit of storage and replay. */
export interface StoredEvent<TPayload = unknown> {
  /** Globally unique event id. */
  readonly id: string;
  /** Stream (aggregate) identifier. */
  readonly streamId: string;
  /** Position within the stream (0-based, contiguous). */
  readonly streamVersion: number;
  /** Position in the global log (0-based, contiguous). */
  readonly globalPosition: number;
  readonly type: string;
  /** Schema version of `data` as stored. */
  readonly schemaVersion: number;
  readonly data: TPayload;
  readonly metadata: EventMetadata;
  /** Commit timestamp (ms epoch). */
  readonly timestamp: number;
}

/** Serialized durable record (what an on-disk store would persist). */
export interface SerializedEventRecord {
  readonly id: string;
  readonly streamId: string;
  readonly streamVersion: number;
  readonly globalPosition: number;
  readonly type: string;
  readonly schemaVersion: number;
  /** JSON-encoded payload. */
  readonly payloadJson: string;
  /** JSON-encoded metadata. */
  readonly metadataJson: string;
  readonly timestamp: number;
}

/** Snapshot of an aggregate's folded state at a stream version. */
export interface Snapshot<TState = unknown> {
  readonly streamId: string;
  /** Stream version this snapshot was taken at (inclusive). */
  readonly streamVersion: number;
  readonly state: TState;
  readonly takenAt: number;
}

/** Thrown when expectedVersion does not match the current stream version. */
export class ConcurrencyError extends Error {
  constructor(
    public readonly streamId: string,
    public readonly expected: number,
    public readonly actual: number
  ) {
    super(
      `Concurrency conflict on stream '${streamId}': expected version ${expected}, actual ${actual}`
    );
    this.name = 'ConcurrencyError';
  }
}

export class StreamNotFoundError extends Error {
  constructor(public readonly streamId: string) {
    super(`Stream '${streamId}' does not exist`);
    this.name = 'StreamNotFoundError';
  }
}

/**
 * Expected-version sentinel values.
 * - `ANY`: no check
 * - `NO_STREAM`: stream must not yet exist
 * - `STREAM_EXISTS`: stream must exist (any version)
 * - number: exact current version required
 */
export const ANY = -2;
export const NO_STREAM = -1;
export const STREAM_EXISTS = -3;
export type ExpectedVersion = number;

/** Upcaster: transforms a stored event of an older schema into the current shape. */
export type Upcaster = (event: StoredEvent) => StoredEvent;

export type EventHandler = (event: StoredEvent) => void | Promise<void>;

export interface ReadStreamOptions {
  /** First stream version to read (inclusive). Default 0. */
  fromVersion?: number;
  /** Max events to return. */
  limit?: number;
  /** Read backwards from the end (for tail-heavy loads). */
  backwards?: boolean;
}

export interface ReplayOptions {
  /** Global position to start from (inclusive). Default 0. */
  fromPosition?: number;
  /** Stop after this many events. Default: all. */
  limit?: number;
  /** Optional event-type filter. */
  typeFilter?: (type: string) => boolean;
}

export interface SubscriptionHandle {
  readonly id: string;
  stop(): void;
}

// ============================================================================
// Aggregate root helper
// ============================================================================

/**
 * Minimal event-sourced aggregate base. Domain aggregates subclass this,
 * raise events via `raise()`, and rebuild state via `loadFromHistory()`.
 */
export abstract class EventSourcedAggregate<TState = unknown> {
  /** Pending events raised but not yet committed. */
  private _pending: NewEvent[] = [];
  private _version = -1;

  constructor(readonly id: string) {}

  /** Current committed stream version (-1 = new). */
  get version(): number {
    return this._version;
  }

  /** Events awaiting commit. */
  get pendingEvents(): readonly NewEvent[] {
    return this._pending;
  }

  /** Mark pending events as committed. Called by the repository after append. */
  commit(): void {
    this._version += this._pending.length;
    this._pending = [];
  }

  /** Rebuild state from a stream history (already upcast). */
  loadFromHistory(events: readonly StoredEvent[]): void {
    for (const e of events) {
      this.apply(e.data, e.type);
      this._version = e.streamVersion;
    }
  }

  /** Restore from a snapshot then fold the tail events. */
  loadFromSnapshot(snapshot: Snapshot<TState>, tail: readonly StoredEvent[]): void {
    this.restoreSnapshot(snapshot.state);
    this._version = snapshot.streamVersion;
    for (const e of tail) {
      this.apply(e.data, e.type);
      this._version = e.streamVersion;
    }
  }

  /** Raise a new domain event; applied immediately to keep state consistent. */
  protected raise<T>(type: string, data: T, metadata?: EventMetadata): void {
    this._pending.push({ type, data, metadata });
    this.apply(data, type);
  }

  /** Fold an event into aggregate state. Implement in subclass. */
  protected abstract apply(data: unknown, type: string): void;

  /** Capture current state for snapshotting. */
  abstract captureSnapshot(): TState;

  /** Restore state from a snapshot. */
  protected abstract restoreSnapshot(state: TState): void;
}

// ============================================================================
// Aggregate repository
// ============================================================================

/**
 * Repository that loads and saves `EventSourcedAggregate` instances against
 * the store. Uses snapshots when available.
 */
export class AggregateRepository<T extends EventSourcedAggregate<TState>, TState = unknown> {
  constructor(
    private readonly _store: EventStore,
    private readonly _factory: (id: string) => T,
    private readonly _snapshotFrequency = 0 // 0 disables snapshots
  ) {}

  async load(id: string): Promise<T | null> {
    const agg = this._factory(id);
    const snap = this._store.loadSnapshot<TState>(id);
    if (snap) {
      const tail = this._store.readStream(id, { fromVersion: snap.streamVersion + 1 });
      agg.loadFromSnapshot(snap, tail);
      return agg;
    }
    const events = this._store.readStream(id);
    if (events.length === 0) return null;
    agg.loadFromHistory(events);
    return agg;
  }

  async save(agg: T): Promise<void> {
    const pending = agg.pendingEvents;
    if (pending.length === 0) return;
    await this._store.appendToStream(agg.id, agg.version, [...pending]);
    agg.commit();
    if (this._snapshotFrequency > 0) {
      const v = agg.version;
      if ((v + 1) % this._snapshotFrequency === 0) {
        this._store.saveSnapshot({
          streamId: agg.id,
          streamVersion: v,
          state: agg.captureSnapshot(),
          takenAt: Date.now(),
        });
      }
    }
  }
}

// ============================================================================
// The event store
// ============================================================================

export interface EventStoreConfig {
  /** Auto-snapshot frequency used by `recordSnapshotIfDue`. 0 = manual only. */
  snapshotFrequency?: number;
  /** Soft cap on retained global log entries; excess is still readable. */
  maxGlobalLength?: number;
}

let nextEventId = 0;

function genEventId(): string {
  return `evt-${Date.now().toString(36)}-${(nextEventId++).toString(36)}`;
}

export class EventStore {
  private readonly _global: StoredEvent[] = [];
  private readonly _streams = new Map<string, StoredEvent[]>();
  private readonly _snapshots = new Map<string, Snapshot>();
  private readonly _archive = new Map<string, SerializedEventRecord>();
  private readonly _upcasters = new Map<string, Map<number, Upcaster>>();
  private readonly _subscriptions = new Map<
    string,
    { handler: EventHandler; position: number; filter?: (type: string) => boolean }
  >();
  private readonly _config: Required<EventStoreConfig>;

  constructor(config: EventStoreConfig = {}) {
    this._config = {
      snapshotFrequency: config.snapshotFrequency ?? 0,
      maxGlobalLength: config.maxGlobalLength ?? Number.MAX_SAFE_INTEGER,
    };
  }

  // ------------------------------------------------------------ appending

  /**
   * Append events to a stream with optimistic concurrency.
   *
   * @param streamId aggregate / stream id
   * @param expectedVersion expected current stream version, or a sentinel:
   *        `ANY`, `NO_STREAM`, `STREAM_EXISTS`
   * @param events new events to append (committed atomically)
   * @returns the stored events (with assigned versions/positions)
   */
  async appendToStream(
    streamId: string,
    expectedVersion: ExpectedVersion,
    events: readonly NewEvent[]
  ): Promise<StoredEvent[]> {
    if (events.length === 0) return [];

    // --- Begin atomic commit section (sync = atomic in single-threaded JS) ---
    const stream = this._streams.get(streamId);
    const currentVersion = stream ? stream.length - 1 : -1;

    this._checkExpected(streamId, expectedVersion, currentVersion);

    const committed: StoredEvent[] = [];
    let sv = currentVersion;
    for (const e of events) {
      sv++;
      const stored: StoredEvent = {
        id: genEventId(),
        streamId,
        streamVersion: sv,
        globalPosition: this._global.length,
        type: e.type,
        schemaVersion: e.schemaVersion ?? 1,
        data: e.data,
        metadata: { ...(e.metadata ?? {}) },
        timestamp: Date.now(),
      };
      committed.push(stored);
      this._global.push(stored);
      this._archive.set(stored.id, this._serialize(stored));
    }

    if (stream) {
      stream.push(...committed);
    } else {
      this._streams.set(streamId, [...committed]);
    }
    // --- End atomic section ---

    this._notifySubscribers(committed);
    return committed;
  }

  private _checkExpected(streamId: string, expected: ExpectedVersion, actual: number): void {
    switch (expected) {
      case ANY:
        return;
      case NO_STREAM:
        if (actual !== -1) throw new ConcurrencyError(streamId, NO_STREAM, actual);
        return;
      case STREAM_EXISTS:
        if (actual === -1) throw new StreamNotFoundError(streamId);
        return;
      default:
        if (expected < 0) throw new Error(`Invalid expectedVersion: ${expected}`);
        if (expected !== actual) throw new ConcurrencyError(streamId, expected, actual);
    }
  }

  // -------------------------------------------------------------- reading

  /**
   * Read a stream's events (upcast to latest schema). Returns [] for missing streams.
   */
  readStream(streamId: string, options: ReadStreamOptions = {}): StoredEvent[] {
    const stream = this._streams.get(streamId);
    if (!stream) return [];
    let events = stream.slice(options.fromVersion ?? 0);
    if (options.backwards) events = [...events].reverse();
    if (options.limit !== undefined) events = events.slice(0, options.limit);
    return events.map((e) => this._upcast(e));
  }

  /** Current version of a stream (-1 = does not exist). */
  streamVersion(streamId: string): number {
    const s = this._streams.get(streamId);
    return s ? s.length - 1 : -1;
  }

  /** All committed events in global order (upcast), optionally sliced. */
  readAll(options: ReplayOptions = {}): StoredEvent[] {
    let events = this._global.slice(options.fromPosition ?? 0);
    if (options.typeFilter) events = events.filter((e) => options.typeFilter!(e.type));
    if (options.limit !== undefined) events = events.slice(0, options.limit);
    return events.map((e) => this._upcast(e));
  }

  /** Current global log length (= next position). */
  get globalPosition(): number {
    return this._global.length;
  }

  // ------------------------------------------------------------ snapshots

  saveSnapshot(snapshot: Snapshot): void {
    this._snapshots.set(snapshot.streamId, snapshot);
  }

  loadSnapshot<TState = unknown>(streamId: string): Snapshot<TState> | null {
    const s = this._snapshots.get(streamId);
    return s ? (s as Snapshot<TState>) : null;
  }

  /**
   * Recompute a snapshot for a stream by folding its events with `fold`
   * starting from `initial`. Returns the stored snapshot.
   */
  buildSnapshot<TState>(
    streamId: string,
    initial: TState,
    fold: (state: TState, event: StoredEvent) => TState
  ): Snapshot<TState> {
    const events = this.readStream(streamId);
    let state = initial;
    let lastVersion = -1;
    for (const e of events) {
      state = fold(state, e);
      lastVersion = e.streamVersion;
    }
    const snap: Snapshot<TState> = {
      streamId,
      streamVersion: lastVersion,
      state,
      takenAt: Date.now(),
    };
    this._snapshots.set(streamId, snap);
    return snap;
  }

  // ------------------------------------------------------------ upcasting

  /**
   * Register an upcaster for `type` at `schemaVersion`.
   * When a stored event of that (type, schemaVersion) is read, the upcaster
   * transforms it into the next version. Chain registrations to walk v1->v2->v3.
   */
  registerUpcaster(type: string, schemaVersion: number, upcaster: Upcaster): void {
    let forType = this._upcasters.get(type);
    if (!forType) {
      forType = new Map();
      this._upcasters.set(type, forType);
    }
    forType.set(schemaVersion, upcaster);
  }

  /** Apply registered upcasters until no more match (v1 -> v2 -> ... -> current). */
  private _upcast(event: StoredEvent): StoredEvent {
    let e = event;
    // Bounded walk: at most 100 chained migrations prevents infinite loops.
    for (let i = 0; i < 100; i++) {
      const forType = this._upcasters.get(e.type);
      const up = forType?.get(e.schemaVersion);
      if (!up) return e;
      e = up(e);
    }
    return e;
  }

  // ------------------------------------------------- subscriptions & replay

  /**
   * Subscribe to events as they are committed, with optional catch-up replay
   * of history first (from `fromPosition`).
   */
  subscribe(
    handler: EventHandler,
    options: { fromPosition?: number; typeFilter?: (type: string) => boolean } = {}
  ): SubscriptionHandle {
    const id = `sub-${Math.random().toString(36).slice(2)}`;
    this._subscriptions.set(id, {
      handler,
      position: options.fromPosition ?? this._global.length,
      filter: options.typeFilter,
    });
    // Catch-up: replay everything from position.
    if ((options.fromPosition ?? this._global.length) < this._global.length) {
      const backlog = this._global.slice(options.fromPosition ?? 0);
      for (const e of backlog) {
        if (!options.typeFilter || options.typeFilter(e.type)) {
          void handler(this._upcast(e));
        }
      }
      const sub = this._subscriptions.get(id);
      if (sub) sub.position = this._global.length;
    }
    const self = this;
    return {
      id,
      stop() {
        self._subscriptions.delete(id);
      },
    };
  }

  private _notifySubscribers(events: readonly StoredEvent[]): void {
    for (const sub of this._subscriptions.values()) {
      for (const e of events) {
        if (e.globalPosition < sub.position) continue;
        if (sub.filter && !sub.filter(e.type)) continue;
        void sub.handler(this._upcast(e));
        sub.position = e.globalPosition + 1;
      }
    }
  }

  // --------------------------------------------------- projection rebuild

  /**
   * Rebuild a projection by replaying the global log through `project`.
   * `project` receives (event) and mutates its own external state.
   * Returns the number of events processed.
   */
  async rebuildProjection(
    project: EventHandler,
    options: ReplayOptions = {}
  ): Promise<number> {
    const events = this.readAll(options);
    let count = 0;
    for (const e of events) {
      await project(e);
      count++;
    }
    return count;
  }

  // ---------------------------------------------------------- persistence

  /** Durable serialized records — simulates what would be written to disk. */
  serializeAll(): SerializedEventRecord[] {
    return this._global.map((e) => this._archive.get(e.id)!).map((r) => ({ ...r }));
  }

  /**
   * Restore a store from serialized records (as produced by `serializeAll`).
   * Snapshots are not preserved.
   */
  static deserialize(records: readonly SerializedEventRecord[]): EventStore {
    const store = new EventStore();
    const byStream = new Map<string, StoredEvent[]>();
    for (const r of records) {
      const e: StoredEvent = {
        id: r.id,
        streamId: r.streamId,
        streamVersion: r.streamVersion,
        globalPosition: r.globalPosition,
        type: r.type,
        schemaVersion: r.schemaVersion,
        data: JSON.parse(r.payloadJson),
        metadata: JSON.parse(r.metadataJson),
        timestamp: r.timestamp,
      };
      store._global[e.globalPosition] = e;
      store._archive.set(e.id, { ...r });
      let s = byStream.get(e.streamId);
      if (!s) {
        s = [];
        byStream.set(e.streamId, s);
      }
      s[e.streamVersion] = e;
    }
    // Compact streams (positions may be sparse if records were filtered).
    for (const [id, arr] of byStream) {
      store._streams.set(id, arr.filter((x) => x !== undefined));
    }
    // Ensure global array is dense
    for (let i = 0; i < store._global.length; i++) {
      if (store._global[i] === undefined) {
        store._global.splice(i, store._global.length - i);
        break;
      }
    }
    return store;
  }

  private _serialize(e: StoredEvent): SerializedEventRecord {
    return {
      id: e.id,
      streamId: e.streamId,
      streamVersion: e.streamVersion,
      globalPosition: e.globalPosition,
      type: e.type,
      schemaVersion: e.schemaVersion,
      payloadJson: JSON.stringify(e.data),
      metadataJson: JSON.stringify(e.metadata),
      timestamp: e.timestamp,
    };
  }
}
