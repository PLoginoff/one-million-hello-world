/**
 * InvalidationBatcher — coalesce purge requests into batches.
 *
 * High-traffic invalidation shouldn't hit the provider API per-request:
 * callers enqueue `PurgeRequest`s and the batcher flushes them:
 *   - when `maxBatch` requests accumulate, or
 *   - when `flushIntervalMs` elapses since the first queued item, or
 *   - on explicit `flush()`.
 *
 * Enqueue-time dedup drops exact duplicates (same kind + normalized
 * value) already queued, and a `maxQueue` cap sheds load when the
 * producer outruns the flush drain — the oldest queued item is
 * evicted (purges are idempotent, so dropping to a later flush is
 * safer than growing memory unboundedly).
 *
 * @module CdnIntegration/Engines
 */

import { PurgeEngine } from './PurgeEngine';
import { IClock, PurgeKind, PurgeRequest, PurgeResult, SystemClock } from './types';

export interface BatcherOptions {
  /** Flush when this many requests are queued. Default 50. */
  maxBatch?: number;
  /** Flush this often (ms) once the queue is non-empty. Default 1000. */
  flushIntervalMs?: number;
  /** Max queued items before oldest are evicted. Default 10_000. */
  maxQueue?: number;
  /** Called with each flushed batch's results. */
  onFlush?: (results: PurgeResult[]) => void;
  clock?: IClock;
}

export class InvalidationBatcher {
  private readonly _engine: PurgeEngine;
  private readonly _clock: IClock;
  private readonly _maxBatch: number;
  private readonly _flushMs: number;
  private readonly _maxQueue: number;
  private readonly _onFlush: ((results: PurgeResult[]) => void) | undefined;
  private _queue: PurgeRequest[] = [];
  private _queuedKeys = new Set<string>();
  private _oldestAt: number | null = null;
  private _flushed = 0;

  constructor(engine: PurgeEngine, options: BatcherOptions = {}) {
    this._engine = engine;
    this._clock = options.clock ?? new SystemClock();
    this._maxBatch = options.maxBatch ?? 50;
    this._flushMs = options.flushIntervalMs ?? 1_000;
    this._maxQueue = options.maxQueue ?? 10_000;
    this._onFlush = options.onFlush;
  }

  queueSize(): number {
    return this._queue.length;
  }

  flushedCount(): number {
    return this._flushed;
  }

  /**
   * Add a purge to the queue. Returns `true` when queued, `false` for
   * an in-queue duplicate. May trigger an immediate flush when the
   * batch size cap is hit.
   */
  enqueue(request: PurgeRequest): boolean {
    const k = dedupKey(request);
    if (this._queuedKeys.has(k)) return false;
    this._queuedKeys.add(k);
    this._queue.push(request);
    if (this._oldestAt === null) this._oldestAt = this._clock.now();

    // Shed oldest when over capacity.
    while (this._queue.length > this._maxQueue) {
      const evicted = this._queue.shift();
      if (evicted !== undefined) this._queuedKeys.delete(dedupKey(evicted));
    }
    if (this._queue.length >= this._maxBatch) {
      this.flush();
    }
    return true;
  }

  /**
   * Periodic tick: flush when the oldest item has waited >= flushInterval.
   * Callers drive this from a timer; injectable clock keeps it testable.
   */
  tick(): void {
    if (this._oldestAt === null) return;
    if (this._clock.now() - this._oldestAt >= this._flushMs) {
      this.flush();
    }
  }

  /** Flush the queue through the PurgeEngine now. */
  flush(): PurgeResult[] {
    if (this._queue.length === 0) return [];
    const batch = this._queue;
    this._queue = [];
    this._queuedKeys = new Set();
    this._oldestAt = null;
    const results = this._engine.purgeAll(batch);
    this._flushed += results.length;
    this._onFlush?.(results);
    return results;
  }
}

function dedupKey(r: PurgeRequest): string {
  // Normalize path-ish values so `/a` and `a` dedup together.
  const v = r.kind === PurgeKind.Prefix || r.kind === PurgeKind.Wildcard
    ? (r.value.startsWith('/') ? r.value : `/${r.value}`)
    : r.value;
  return `${r.kind}:${v}`;
}
