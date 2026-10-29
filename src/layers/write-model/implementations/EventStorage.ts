/**
 * EventStorage — in-memory append-only event store for the write model.
 *
 * Events are stored per aggregate stream (`aggregateType:aggregateId`)
 * with a per-stream monotonically increasing `aggregateVersion`, plus a
 * global `position` across all streams for cross-stream ordering.
 *
 * Concurrency model: optimistic — `append` requires the caller to declare
 * the expected stream version. If the stream moved past that version, a
 * `ConcurrencyError` is thrown. This matches how real event stores
 * (EventStoreDB, Marten, Axon) handle write conflicts.
 *
 * Read paths:
 *   - `readStream(type, id)` → events for one aggregate
 *   - `readAll(fromPosition?)` → global ordered stream (for projections)
 *   - `streamVersion(type, id)` → current committed version
 *
 * Snapshots are stored alongside streams and keyed by aggregate id —
 * see `AggregateRepository` for the load-side usage.
 *
 * This is intentionally standalone (no cross-layer imports) but mirrors
 * the shape of `src/layers/event-sourcing/implementations/EventStore.ts`.
 *
 * @module WriteModelLayer/Implementations
 */

import type { EventEnvelope, AggregateSnapshot } from './AggregateRoot';

// ------------------------------------------------------------------ errors

export class ConcurrencyError extends Error {
  readonly streamId: string;
  readonly expected: number;
  readonly actual: number;
  constructor(streamId: string, expected: number, actual: number) {
    super(
      `Concurrency conflict on stream '${streamId}': expected version ${expected}, actual ${actual}`,
    );
    this.name = 'ConcurrencyError';
    this.streamId = streamId;
    this.expected = expected;
    this.actual = actual;
  }
}

export class StreamNotFoundError extends Error {
  readonly streamId: string;
  constructor(streamId: string) {
    super(`Stream '${streamId}' not found`);
    this.name = 'StreamNotFoundError';
    this.streamId = streamId;
  }
}

/** Sentinel for "append regardless of current version". */
export const ANY_VERSION = -1 as const;
/** Sentinel for "stream must not exist yet". */
export const NO_STREAM = 0 as const;

// ------------------------------------------------------------------ store

let _envelopeCounter = 0;
function nextEventId(): string {
  _envelopeCounter += 1;
  return `ev-${Date.now().toString(36)}-${_envelopeCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export interface AppendEventInput {
  readonly type: string;
  readonly data: unknown;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly metadata?: Record<string, unknown>;
}

export class EventStorage {
  /** streamKey = `${aggregateType}:${aggregateId}` → envelopes */
  private readonly _streams = new Map<string, EventEnvelope[]>();
  /** All envelopes in global order. */
  private readonly _global: EventEnvelope[] = [];
  /** Snapshots keyed by streamKey. */
  private readonly _snapshots = new Map<string, AggregateSnapshot>();
  /** Per-stream soft-delete marker. */
  private readonly _deleted = new Set<string>();

  /**
   * Append a batch of events to a stream atomically.
   *
   * @param expectedVersion  `NO_STREAM` (0) requires the stream to be
   *        empty; `ANY_VERSION` (-1) skips the check; otherwise must
   *        equal the current stream version.
   * @returns the appended envelopes with stamped versions + positions.
   */
  append(
    aggregateType: string,
    aggregateId: string,
    expectedVersion: number,
    events: readonly AppendEventInput[],
  ): EventEnvelope[] {
    if (events.length === 0) return [];
    const streamKey = `${aggregateType}:${aggregateId}`;
    if (this._deleted.has(streamKey)) {
      throw new StreamNotFoundError(streamKey);
    }
    const stream = this._streams.get(streamKey) ?? [];
    const currentVersion = stream.length;

    this._checkExpected(streamKey, expectedVersion, currentVersion);

    const appended: EventEnvelope[] = [];
    let sv = currentVersion;
    for (const e of events) {
      sv += 1;
      const envelope: EventEnvelope = {
        eventId: nextEventId(),
        aggregateId,
        aggregateType,
        aggregateVersion: sv,
        type: e.type,
        data: e.data,
        correlationId: e.correlationId,
        causationId: e.causationId,
        timestamp: Date.now(),
        metadata: e.metadata ? { ...e.metadata } : {},
      };
      appended.push(envelope);
    }
    stream.push(...appended);
    this._streams.set(streamKey, stream);
    this._global.push(...appended);
    return appended;
  }

  /**
   * Read all events for a stream, optionally starting from a version.
   * `fromVersion` is INCLUSIVE — readStream('x', '1', {fromVersion: 3})
   * returns events with aggregateVersion >= 3.
   */
  readStream(
    aggregateType: string,
    aggregateId: string,
    options: { fromVersion?: number; maxCount?: number } = {},
  ): EventEnvelope[] {
    const streamKey = `${aggregateType}:${aggregateId}`;
    if (this._deleted.has(streamKey)) return [];
    const stream = this._streams.get(streamKey);
    if (!stream) return [];
    let out = stream;
    if (options.fromVersion !== undefined) {
      out = out.filter((e) => e.aggregateVersion >= options.fromVersion!);
    }
    if (options.maxCount !== undefined) {
      out = out.slice(0, options.maxCount);
    }
    return out;
  }

  /** Current committed version of a stream (0 = doesn't exist). */
  streamVersion(aggregateType: string, aggregateId: string): number {
    const streamKey = `${aggregateType}:${aggregateId}`;
    if (this._deleted.has(streamKey)) return 0;
    return this._streams.get(streamKey)?.length ?? 0;
  }

  /** Whether the stream exists (has at least one event). */
  streamExists(aggregateType: string, aggregateId: string): boolean {
    return this.streamVersion(aggregateType, aggregateId) > 0;
  }

  /**
   * Read events across all streams in global commit order. `fromPosition`
   * is INCLUSIVE (position = index + 1). Used by denormalizers / catch-up
   * subscriptions.
   */
  readAll(options: { fromPosition?: number; maxCount?: number } = {}): EventEnvelope[] {
    const from = options.fromPosition ?? 1;
    const start = Math.max(0, from - 1);
    let out = this._global.slice(start);
    if (options.maxCount !== undefined) {
      out = out.slice(0, options.maxCount);
    }
    return out;
  }

  /** Total committed event count (global head position). */
  get globalPosition(): number {
    return this._global.length;
  }

  /**
   * Soft-delete a stream — reads return empty and appends throw. The
   * global event list is unaffected (projections still see history).
   */
  deleteStream(aggregateType: string, aggregateId: string): void {
    this._deleted.add(`${aggregateType}:${aggregateId}`);
    this._streams.delete(`${aggregateType}:${aggregateId}`);
    this._snapshots.delete(`${aggregateType}:${aggregateId}`);
  }

  // ------------------------------------------------------------- snapshots

  /** Persist a snapshot (overwrites any existing one). */
  saveSnapshot<TState>(snapshot: AggregateSnapshot<TState>): void {
    const key = `${snapshot.aggregateType}:${snapshot.aggregateId}`;
    this._snapshots.set(key, snapshot as AggregateSnapshot);
  }

  /** Load the snapshot for a stream, if any. */
  loadSnapshot<TState>(aggregateType: string, aggregateId: string): AggregateSnapshot<TState> | undefined {
    const key = `${aggregateType}:${aggregateId}`;
    return this._snapshots.get(key) as AggregateSnapshot<TState> | undefined;
  }

  /** Enumerate all stream keys (for admin / diagnostics). */
  streamKeys(): string[] {
    return [...this._streams.keys()];
  }

  /** Total streams tracked. */
  get streamCount(): number {
    return this._streams.size;
  }

  // ------------------------------------------------------------- internal

  private _checkExpected(streamKey: string, expected: number, actual: number): void {
    if (expected === ANY_VERSION) return;
    if (expected === NO_STREAM) {
      if (actual !== 0) {
        throw new ConcurrencyError(streamKey, 0, actual);
      }
      return;
    }
    if (actual !== expected) {
      throw new ConcurrencyError(streamKey, expected, actual);
    }
  }
}
