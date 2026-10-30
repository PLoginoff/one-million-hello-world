/**
 * Event Engine — shared types.
 *
 * This is the event layer's SECOND storage/dispatch engine, distinct from
 * the existing pieces:
 *
 *   - `infrastructure/MemoryEventStore` is a Map keyed by event id with
 *     type/correlation indexes — lookup-oriented.
 *   - `core/EventBus` dispatches `domain/entities/Event` value objects to
 *     subscribers — routing-oriented.
 *
 * This engine is a real append-only EVENT LOG: a global commit log with
 * monotonic positions, per-stream ordering guarantees, position-based
 * catch-up subscriptions, projections with checkpoints, and schema
 * upcasting. Naming is deliberately distinct (`EngineEvent`, `EventLog`)
 * to avoid colliding with the existing `Event` entity / `EventMetadata`
 * value object / `MemoryEventStore` class.
 *
 * @module EventLayer/Engine
 */

/**
 * Envelope metadata — the plumbing fields every dispatched event carries
 * regardless of payload. These are what let consumers trace a chain:
 * `correlationId` ties together all events caused by one external request;
 * `causationId` names the specific event/command that caused this one.
 */
export interface EventEnvelopeMeta {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly actor?: string;
  readonly [key: string]: unknown;
}

/** An event as submitted by a producer (pre-commit). */
export interface EngineEvent<TPayload = unknown> {
  /** Stream (aggregate/topic) this event belongs to. */
  readonly streamId: string;
  /** Event type name, e.g. `OrderCreated`. */
  readonly type: string;
  /** Schema version of `data` (default 1). Drives upcasting on read. */
  readonly schemaVersion?: number;
  readonly data: TPayload;
  readonly meta?: EventEnvelopeMeta;
}

/** A committed event — the atom of the log. */
export interface StoredEngineEvent<TPayload = unknown> {
  readonly id: string;
  readonly streamId: string;
  /** Position within the stream (0-based, contiguous — the stream's "version"). */
  readonly streamPosition: number;
  /** Position in the global commit log (0-based, contiguous). */
  readonly globalPosition: number;
  readonly type: string;
  readonly schemaVersion: number;
  readonly data: TPayload;
  readonly meta: EventEnvelopeMeta;
  /** Commit timestamp from the injectable clock (ms epoch). */
  readonly committedAt: number;
}

/** Function that upgrades one event by one schema version. */
export type Upcaster = (data: unknown, meta: EventEnvelopeMeta) => unknown;

/** Thrown when `expectedStreamPosition` doesn't match the stream tip. */
export class EventConcurrencyError extends Error {
  constructor(
    public readonly streamId: string,
    public readonly expected: number,
    public readonly actual: number
  ) {
    super(
      `Concurrency conflict on stream "${streamId}": expected position ${expected}, found ${actual}`
    );
    this.name = 'EventConcurrencyError';
  }
}

/** Thrown for malformed engine arguments (negative positions, bad ranges). */
export class EventEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventEngineError';
  }
}
