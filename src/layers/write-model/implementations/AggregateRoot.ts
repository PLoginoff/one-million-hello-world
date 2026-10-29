/**
 * AggregateRoot — base class for event-sourced aggregates on the write side.
 *
 * An aggregate root is a consistency boundary: all writes to entities inside
 * the aggregate go through the root, which enforces invariants and records
 * state changes as domain events. Events are the *source of truth* — the
 * aggregate's fields are a derived, in-memory projection of the event log.
 *
 * Lifecycle:
 *   1. Commands call methods on the aggregate (e.g. `account.withdraw(50)`).
 *   2. Methods validate invariants, then `raise(type, data)` — events are
 *      appended to `pendingEvents` and applied to update local state.
 *   3. The repository persists `pendingEvents` with optimistic concurrency
 *      on `version`, then calls `commitEvents()`.
 *   4. On load, `loadFromHistory(events)` replays events through `apply()`
 *      to rebuild state.
 *
 * Event application is *deterministic* — `apply` never throws and never
 * raises further events. Command methods may throw (invariant violation).
 *
 * Subclasses must implement:
 *   - `applyEvent(event)` — state transition for each event type
 *   - `snapshotState()` / `restoreSnapshot(state)` — optional memento
 *
 * @module WriteModelLayer/Implementations
 */

// ------------------------------------------------------------------ events

/**
 * Domain event raised inside an aggregate, before persistence. It becomes
 * an `EventEnvelope` once the repository stamps it with metadata.
 */
export interface DomainEvent<TData = unknown> {
  /** Event type discriminator, e.g. 'account.withdrawn'. */
  readonly type: string;
  /** Event payload — must be JSON-serializable. */
  readonly data: TData;
}

/**
 * Persisted event envelope. The repository constructs this at append time,
 * stamping identity + ordering + tracing metadata.
 */
export interface EventEnvelope<TData = unknown> {
  /** Globally unique event id. */
  readonly eventId: string;
  /** Owning aggregate id. */
  readonly aggregateId: string;
  /** Aggregate type / stream category, e.g. 'account'. */
  readonly aggregateType: string;
  /** Version of the aggregate AFTER this event (1-based). */
  readonly aggregateVersion: number;
  /** Event type discriminator. */
  readonly type: string;
  /** Event payload. */
  readonly data: TData;
  /** Correlation id tying this event to its originating command. */
  readonly correlationId?: string;
  /** The command/event that caused this event. */
  readonly causationId?: string;
  /** Wall-clock append time (epoch ms). */
  readonly timestamp: number;
  /** Free-form metadata. */
  readonly metadata: Record<string, unknown>;
}

/** Aggregate snapshot — a memento used to speed up rehydration. */
export interface AggregateSnapshot<TState = unknown> {
  readonly aggregateId: string;
  readonly aggregateType: string;
  /** Aggregate version captured in `state`. */
  readonly version: number;
  readonly state: TState;
  readonly takenAt: number;
}

// ------------------------------------------------------------ base class

export abstract class AggregateRoot<TState = unknown> {
  readonly id: string;
  abstract readonly aggregateType: string;

  /**
   * Committed version — the number of events persisted to the store.
   * `version` always equals the aggregateVersion of the last committed
   * event, or 0 for a new aggregate.
   */
  private _version = 0;

  /** Events raised by the current command, not yet persisted. */
  private readonly _pending: DomainEvent[] = [];

  /** Invariant violations discovered during the current command. */
  private readonly _violations: string[] = [];

  protected constructor(id: string) {
    if (!id || id.length === 0) {
      throw new Error('Aggregate id must be non-empty');
    }
    this.id = id;
  }

  /** Committed version (0 = brand new). */
  get version(): number {
    return this._version;
  }

  /** Pending (uncommitted) domain events. */
  get pendingEvents(): readonly DomainEvent[] {
    return this._pending;
  }

  /** Version the aggregate will have after committing pending events. */
  get expectedVersion(): number {
    return this._version + this._pending.length;
  }

  /**
   * Raise a domain event: append to pending list and apply to state.
   * `applyEvent` is called synchronously — subclasses should treat it as
   * a pure state transition.
   */
  protected raise<TData>(type: string, data: TData): void {
    const event: DomainEvent<TData> = { type, data };
    this.applyEvent(event);
    this._pending.push(event);
  }

  /**
   * Record an invariant violation. Violations are checked by the
   * repository before persisting — a non-empty list rejects the commit.
   */
  protected violate(message: string): void {
    this._violations.push(message);
  }

  /** Current invariant violations (read-only). */
  get violations(): readonly string[] {
    return this._violations;
  }

  /**
   * Apply a domain event to the aggregate's state. Called both for new
   * events (via raise) and during historical replay. MUST be deterministic
   * and side-effect-free.
   */
  protected abstract applyEvent(event: DomainEvent): void;

  /**
   * Snapshot the aggregate's state. Default implementation returns
   * `undefined` — snapshots are opt-in. Subclasses that override this
   * should also override `restoreSnapshot`.
   */
  snapshotState(): TState | undefined {
    return undefined;
  }

  /** Restore from a snapshot produced by `snapshotState`. */
  protected restoreSnapshot(_state: TState): void {
    throw new Error(
      `${this.aggregateType}: snapshotState() must be overridden to support restore`,
    );
  }

  /** Check whether this aggregate supports snapshots. */
  get supportsSnapshots(): boolean {
    // Cheap probe — if snapshotState is overridden the subclass returns
    // a value rather than the base `undefined`.
    try {
      return this.snapshotState() !== undefined;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------- repository hooks

  /**
   * Rehydrate from a committed event stream. Replays each event through
   * applyEvent and bumps `_version` to the event's version. Resets pending
   * events (a loaded aggregate starts clean).
   */
  loadFromHistory(events: readonly EventEnvelope[]): void {
    for (const e of events) {
      this.applyEvent({ type: e.type, data: e.data });
      this._version = e.aggregateVersion;
    }
    this._pending.length = 0;
    this._violations.length = 0;
  }

  /** Load from a snapshot + optional event tail. */
  loadFromSnapshot(snapshot: AggregateSnapshot<TState>, tail: readonly EventEnvelope[] = []): void {
    this.restoreSnapshot(snapshot.state);
    this._version = snapshot.version;
    this.loadFromHistory(tail);
  }

  /**
   * Drain pending events — used by the repository to build envelopes.
   * Does NOT bump `_version`; that's the repository's job after a
   * successful append.
   */
  drainPendingEvents(): DomainEvent[] {
    const drained = [...this._pending];
    this._pending.length = 0;
    return drained;
  }

  /**
   * Called by the repository after a successful save. `newVersion` is the
   * store-assigned committed version.
   */
  markCommitted(newVersion: number): void {
    this._version = newVersion;
    this._pending.length = 0;
    this._violations.length = 0;
  }

  /**
   * Roll back pending events — discards them without applying. State is
   * NOT rolled back (events were already applied); use sparingly. For
   * true undo, reload the aggregate.
   */
  discardPending(): void {
    this._pending.length = 0;
  }

  /** True iff this aggregate has uncommitted events. */
  get isDirty(): boolean {
    return this._pending.length > 0;
  }

  /** Internal setter used by tests / specialized repositories. */
  protected _setVersion(v: number): void {
    this._version = v;
  }
}
