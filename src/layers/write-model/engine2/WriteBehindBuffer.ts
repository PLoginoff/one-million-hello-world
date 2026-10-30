/**
 * WriteBehindBuffer — batch commits for the write side.
 *
 * Write-behind decouples command acknowledgement from durable commit:
 * accepted events are appended to a buffer and flushed in batches. The
 * win is I/O batching; the risk is acknowledged-but-unflushed writes
 * being lost on crash — bounded by `maxBuffered` backpressure and
 * `flushIntervalMs` flush cadence.
 *
 * Flush triggers, whichever first:
 *  - buffer reaches `maxBuffered` events
 *  - `flushIntervalMs` elapsed since oldest buffered event (check via
 *    `maybeFlush(now)` called on a cadence)
 *  - explicit `flush()`
 *
 * Ordering is preserved — events flush in append order per stream. A
 * flush failure leaves the batch intact and sets `lastError`; the next
 * flush retries the same batch (at-least-once commit semantics; dedup
 * on the read side is what keeps that safe).
 *
 * @module WriteModelLayer/Engine2
 */

import { WmClock2, SystemWmClock2 } from './types';

export interface BufferedEvent {
  readonly stream: string;
  readonly position: number;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly appendedAtMs: number;
}

export type FlushResult =
  | { readonly kind: 'flushed'; readonly events: number }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error'; readonly error: string };

export interface WriteBehindOptions {
  /** Flush when this many events are buffered. Default 500. */
  maxBuffered?: number;
  /** Flush when oldest buffered event is this old (ms). Default 250. */
  flushIntervalMs?: number;
  /** Commit sink — returns number committed or throws. */
  sink: (events: readonly BufferedEvent[]) => number;
  clock?: WmClock2;
}

export class WriteBehindBuffer {
  private readonly _maxBuffered: number;
  private readonly _flushIntervalMs: number;
  private readonly _sink: (events: readonly BufferedEvent[]) => number;
  private readonly _clock: WmClock2;
  private _buf: BufferedEvent[] = [];
  private _lastError: string | null = null;
  private _flushes = 0;
  private _dropped = 0;

  constructor(opts: WriteBehindOptions) {
    this._maxBuffered = Math.max(1, opts.maxBuffered ?? 500);
    this._flushIntervalMs = Math.max(1, opts.flushIntervalMs ?? 250);
    this._sink = opts.sink;
    this._clock = opts.clock ?? new SystemWmClock2();
  }

  /**
   * Buffer an event. Returns false (backpressure) when the buffer is
   * full and a flush hasn't drained it — the caller should flush and
   * retry, or reject the command with 503.
   */
  append(ev: Omit<BufferedEvent, 'appendedAtMs'>): boolean {
    if (this._buf.length >= this._maxBuffered) {
      this._dropped++;
      return false;
    }
    this._buf.push({ ...ev, appendedAtMs: this._clock.now() });
    return true;
  }

  /** Time-triggered flush check — call on a cadence. */
  maybeFlush(): FlushResult | null {
    if (this._buf.length === 0) return null;
    const oldest = this._buf[0].appendedAtMs;
    if (this._clock.now() - oldest >= this._flushIntervalMs || this._buf.length >= this._maxBuffered) {
      return this.flush();
    }
    return null;
  }

  /**
   * Commit the buffer through the sink. On sink failure the batch is
   * kept and `lastError` set — next flush retries it (at-least-once).
   */
  flush(): FlushResult {
    if (this._buf.length === 0) return { kind: 'empty' };
    const batch = this._buf;
    try {
      const n = this._sink(batch);
      this._buf = this._buf.slice(n);
      this._flushes++;
      this._lastError = null;
      return { kind: 'flushed', events: n };
    } catch (e) {
      this._lastError = e instanceof Error ? e.message : String(e);
      return { kind: 'error', error: this._lastError };
    }
  }

  get buffered(): number {
    return this._buf.length;
  }
  get lastError(): string | null {
    return this._lastError;
  }
  get flushCount(): number {
    return this._flushes;
  }
  /** Events rejected by backpressure. */
  get droppedCount(): number {
    return this._dropped;
  }

  /** Peek buffered events without committing (debug/drain). */
  pending(): readonly BufferedEvent[] {
    return this._buf;
  }
}
