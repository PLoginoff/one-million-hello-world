/**
 * Aggregate Root Base
 *
 * Base class providing the aggregate invariants every domain root
 * needs: optimistic-concurrency versioning, uncommitted domain-event
 * collection, and event-sourced state transitions via `apply()`.
 *
 * Contract:
 * - `version` starts at 0 (or the stored version when rehydrating).
 * - Each `raise(event)` increments `version` and appends the event to
 *   the uncommitted buffer.
 * - `markEventsAsCommitted()` drains the buffer — the repository layer
 *   reads it before the drain to persist.
 * - `apply(event, isNew)` dispatches to `when<EventType>` convention
 *   methods so event-sourced aggregates mutate state through the same
 *   path for both fresh changes and history replay.
 *
 * @module DomainLayer/Engine
 */

import { DomainEvent } from '../types/domain-types';
import { EngineDomainEvent } from './types';

let eventSeq = 0;

/** Default event factory — monotonically increasing ids. */
function defaultEventFactory(
  eventType: string,
  aggregateId: string,
  sequenceNumber: number,
  data?: Record<string, unknown>
): EngineDomainEvent {
  return {
    eventId: `evt-${++eventSeq}`,
    eventType,
    aggregateId,
    sequenceNumber,
    occurredAt: new Date(),
    data,
  };
}

/**
 * Aggregate root base class.
 *
 * Subclasses implement `when<EventType>(event)` handlers to mutate
 * state in response to events, and call `this.raise(...)` from business
 * methods to emit them.
 */
export abstract class AggregateRootBase {
  private readonly _id: string;
  private _version: number;
  private _uncommittedEvents: EngineDomainEvent[];
  private readonly _createdAt: Date;

  protected constructor(id: string, version = 0) {
    if (id === '') {
      throw new Error('Aggregate id must not be empty');
    }
    if (version < 0) {
      throw new Error('Aggregate version must be non-negative');
    }
    this._id = id;
    this._version = version;
    this._uncommittedEvents = [];
    this._createdAt = new Date();
  }

  get id(): string {
    return this._id;
  }

  /**
   * Current version: number of events ever applied to this aggregate.
   * Matches the event store's expected version for optimistic locking.
   */
  get version(): number {
    return this._version;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  /**
   * Uncommitted events, in raise order. Read-only copy — the buffer
   * belongs to the aggregate until `markEventsAsCommitted` drains it.
   */
  getUncommittedEvents(): readonly EngineDomainEvent[] {
    return [...this._uncommittedEvents];
  }

  /**
   * Drain the uncommitted buffer. Call after the repository has
   * persisted the events — idempotent (second call is a no-op on an
   * empty buffer).
   */
  markEventsAsCommitted(): void {
    this._uncommittedEvents = [];
  }

  /**
   * Raise a new domain event: increments version, records the event
   * in the uncommitted buffer, and applies it through `apply()` so the
   * aggregate's state mutates in the same path as replays.
   */
  protected raise(
    eventType: string,
    data?: Record<string, unknown>,
    factory = defaultEventFactory
  ): EngineDomainEvent {
    const event = factory(eventType, this._id, this._version + 1, data);
    this.apply(event, true);
    return event;
  }

  /**
   * Apply an event to the aggregate state.
   *
   * Dispatch is by convention: the handler for event type `UserCreated`
   * is `whenUserCreated(event)`. Missing handlers are ignored — this
   * lets aggregates ignore events raised for other aggregates in a
   * shared event stream.
   *
   * @param isNew When true, the event is buffered for later commit.
   *              When false (rehydration), it's only applied to state.
   */
  apply(event: EngineDomainEvent, isNew: boolean): void {
    const handlerName = `when${event.eventType}`;
    const handler = (this as unknown as Record<string, unknown>)[handlerName];
    if (typeof handler === 'function') {
      (handler as (e: EngineDomainEvent) => void).call(this, event);
    }
    this._version = event.sequenceNumber;
    if (isNew) {
      this._uncommittedEvents.push(event);
    }
  }

  /**
   * Optimistic-concurrency check: compare the expected version against
   * the current one. Throws on mismatch — repositories call this before
   * persisting to detect lost updates.
   */
  assertVersion(expected: number): void {
    if (this._version !== expected) {
      throw new VersionConflictError(this._id, expected, this._version);
    }
  }
}

/** Raised when the aggregate's version doesn't match the expected one. */
export class VersionConflictError extends Error {
  readonly aggregateId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(aggregateId: string, expected: number, actual: number) {
    super(`Version conflict on aggregate ${aggregateId}: expected ${expected}, got ${actual}`);
    this.name = 'VersionConflictError';
    this.aggregateId = aggregateId;
    this.expectedVersion = expected;
    this.actualVersion = actual;
  }
}
