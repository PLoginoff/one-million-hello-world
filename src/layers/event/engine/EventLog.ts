/**
 * EventLog — append-only commit log with per-stream ordering.
 *
 * Storage layout (all in-memory):
 *   `_log`     — array of every committed event in commit order; its index
 *                IS the global position. The log is write-once: entries are
 *                never mutated or removed (the "append-only" contract).
 *   `_streams` — streamId → array of that stream's events in order; a
 *                stream's array index IS the stream position.
 *
 * Optimistic concurrency: `append` takes `expectedStreamPosition` —
 * "the version I read when I decided to emit these events". If the stream
 * moved on, the append fails with `EventConcurrencyError`. Because JS is
 * single-threaded, the check-then-append section is atomic between awaits.
 *
 * Read paths:
 *   `readStream`   — O(1) slice per range; stream arrays are contiguous.
 *   `readFrom`     — global-log slice from a position (catch-up/replay).
 *   `readStreamBackwards` — for "latest N events" queries.
 *
 * @module EventLayer/Engine
 */

import {
  EngineEvent,
  EventConcurrencyError,
  EventEngineError,
  StoredEngineEvent,
} from './types';

export interface EventLogOptions {
  /** Injectable clock (ms epoch) — deterministic tests. */
  readonly clock?: () => number;
  /** Injectable id generator — deterministic tests. */
  readonly idGen?: () => string;
}

export class EventLog {
  private readonly _log: StoredEngineEvent[] = [];
  private readonly _streams = new Map<string, StoredEngineEvent[]>();
  private readonly clock: () => number;
  private readonly idGen: () => string;

  constructor(options: EventLogOptions = {}) {
    this.clock = options.clock ?? Date.now;
    let counter = 0;
    this.idGen = options.idGen ?? (() => `evt-${Date.now()}-${counter++}`);
  }

  /**
   * Appends a batch of events to a stream atomically.
   *
   * @param expectedStreamPosition  `-1` = stream must not exist / be empty;
   *                                `n`  = stream tip must be at position n
   *                                (so next write lands at n+1);
   *                                omit = no check (dangerous: blind append).
   * @returns the committed events with assigned positions.
   */
  append(
    streamId: string,
    events: readonly EngineEvent[],
    expectedStreamPosition?: number
  ): StoredEngineEvent[] {
    const stream = this._streams.get(streamId) ?? [];
    const tip = stream.length - 1;

    if (expectedStreamPosition !== undefined && expectedStreamPosition !== tip) {
      throw new EventConcurrencyError(streamId, expectedStreamPosition, tip);
    }

    const committed: StoredEngineEvent[] = [];
    for (const e of events) {
      const ev: StoredEngineEvent = {
        id: this.idGen(),
        streamId,
        streamPosition: stream.length + committed.length,
        globalPosition: this._log.length + committed.length,
        type: e.type,
        schemaVersion: e.schemaVersion ?? 1,
        data: e.data,
        meta: e.meta ?? {},
        committedAt: this.clock(),
      };
      committed.push(ev);
    }

    // Commit section: both structures updated together before returning —
    // readers never observe a torn append.
    if (!this._streams.has(streamId)) this._streams.set(streamId, stream);
    for (const ev of committed) {
      stream.push(ev);
      this._log.push(ev);
    }
    return committed;
  }

  /** Stream events in range [from, to] inclusive. O(k) slice. */
  readStream(streamId: string, from = 0, to?: number): StoredEngineEvent[] {
    const stream = this._streams.get(streamId);
    if (!stream) return [];
    return stream.slice(from, to === undefined ? undefined : to + 1);
  }

  /** Latest `count` events of a stream, newest first. */
  readStreamBackwards(streamId: string, count: number): StoredEngineEvent[] {
    const stream = this._streams.get(streamId);
    if (!stream) return [];
    const out: StoredEngineEvent[] = [];
    for (let i = stream.length - 1; i >= 0 && out.length < count; i--) {
      out.push(stream[i]);
    }
    return out;
  }

  /**
   * Global-log scan from `position`, capped at `limit` (default all).
   * This is the catch-up path for projections and subscriptions: positions
   * are stable forever, so a consumer resumes from `lastSeen + 1` safely.
   */
  readFrom(position: number, limit?: number): StoredEngineEvent[] {
    if (position < 0) throw new EventEngineError('position must be >= 0');
    return this._log.slice(position, limit === undefined ? undefined : position + limit);
  }

  /** Current stream tip position, or -1 for an empty/absent stream. */
  streamTip(streamId: string): number {
    return (this._streams.get(streamId)?.length ?? 0) - 1;
  }

  /** Current global tip position, or -1 when the log is empty. */
  get tip(): number {
    return this._log.length - 1;
  }

  get length(): number {
    return this._log.length;
  }

  streamIds(): string[] {
    return [...this._streams.keys()];
  }
}
