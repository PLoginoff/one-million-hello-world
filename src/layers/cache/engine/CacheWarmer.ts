/**
 * CacheWarmer — bounded-concurrency cache preloading.
 *
 * On cold start (or after a deploy / L1 flush), the hottest keys are
 * proactively loaded so the first real requests hit a warm cache.
 * Naively `Promise.all(keys.map(load))` fires N loader calls at once and
 * can starve the very dependencies the cache exists to protect. This
 * warmer walks the key list with a fixed worker pool instead:
 *
 *   keys: [k1..kN] ──> worker1 ─┐
 *                    worker2 ─┼─> set() into cache
 *                    worker3 ─┘    (each pulls next key until done)
 *
 * Features:
 *   - Bounded concurrency (`concurrency`), independent of key count.
 *   - Per-key deadline (`perKeyTimeoutMs`): a slow loader doesn't stall
 *     the batch; its key is marked `timedOut` and the worker moves on.
 *   - Priority ordering: keys are loaded in caller-supplied order, which
 *     is typically "hottest first" — a partially-completed warm still
 *     covers the most valuable keys.
 *   - Resumable: `warm()` returns a `WarmReport`; failed keys can be fed
 *     back via `warm(report.failed)`.
 *   - Cooperative cancellation via `abort()`; workers stop after the
 *     current key.
 *
 * The warmer writes through a caller-supplied `put` function rather than
 * a concrete cache type, so it can feed `MultiLevelCache`, a raw map,
 * or a facade without knowing which.
 *
 * Complexity: O(K / C) wall-clock where K = keys, C = concurrency;
 * memory O(K) for the report.
 *
 * @module CacheLayer/Engine
 */

import { CacheEngineClock, SystemEngineClock } from './types';

/** Loader producing the value to cache for `key`. Throwing = failure. */
export type WarmLoader<T> = (key: string) => Promise<T>;

/** Sink receiving warmed entries (e.g. `cache.set`). */
export type WarmSink<T> = (key: string, value: T) => Promise<void> | void;

export interface WarmerOptions {
  /** Number of parallel workers. Default 4. */
  concurrency?: number;
  /**
   * Per-key deadline (ms). The worker races the loader against this
   * timeout; the loader promise itself is left running (JS can't kill
   * a promise) but its result is discarded. `0` = no per-key timeout.
   */
  perKeyTimeoutMs?: number;
  /** Max keys to attempt in one `warm` call; `0` = unlimited. */
  maxKeys?: number;
  clock?: CacheEngineClock;
}

export interface WarmFailure {
  key: string;
  error: string;
  timedOut: boolean;
}

export interface WarmReport {
  attempted: number;
  succeeded: number;
  failed: WarmFailure[];
  aborted: boolean;
  /** Wall-clock duration on the engine clock. */
  durationMs: number;
}

/**
 * Promise resolved after `ms` on real time (used only to bound loader
 * latency — the engine clock can't interrupt a running promise).
 */
function realDelay(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`warm-timeout:${ms}`)), ms);
  });
}

export class CacheWarmer<T = unknown> {
  private readonly _loader: WarmLoader<T>;
  private readonly _sink: WarmSink<T>;
  private readonly _clock: CacheEngineClock;
  private readonly _concurrency: number;
  private readonly _perKeyTimeoutMs: number;
  private readonly _maxKeys: number;

  private _aborted = false;

  constructor(loader: WarmLoader<T>, sink: WarmSink<T>, options: WarmerOptions = {}) {
    this._loader = loader;
    this._sink = sink;
    this._clock = options.clock ?? new SystemEngineClock();
    this._concurrency = Math.max(1, options.concurrency ?? 4);
    this._perKeyTimeoutMs = Math.max(0, options.perKeyTimeoutMs ?? 0);
    this._maxKeys = Math.max(0, options.maxKeys ?? 0);
  }

  /** Stop after in-flight keys complete; the report marks `aborted`. */
  abort(): void {
    this._aborted = true;
  }

  /** Reset the abort latch so the warmer can be reused. */
  resetAbort(): void {
    this._aborted = false;
  }

  /**
   * Warm `keys` (hottest first). Returns a report; does not throw —
   * per-key failures are collected into `report.failed`.
   */
  async warm(keys: readonly string[]): Promise<WarmReport> {
    const started = this._clock.now();
    const queue = this._maxKeys > 0 ? keys.slice(0, this._maxKeys) : keys.slice();
    const report: WarmReport = {
      attempted: 0,
      succeeded: 0,
      failed: [],
      aborted: false,
      durationMs: 0,
    };

    let cursor = 0;
    const workerCount = Math.min(this._concurrency, queue.length);

    const worker = async (): Promise<void> => {
      while (!this._aborted) {
        const idx = cursor++;
        if (idx >= queue.length) return;
        const key = queue[idx];
        report.attempted++;
        try {
          const value = await this._loadOne(key);
          await this._sink(key, value);
          report.succeeded++;
        } catch (err: unknown) {
          const timedOut = err instanceof Error && err.message.startsWith('warm-timeout:');
          report.failed.push({
            key,
            error: err instanceof Error ? err.message : String(err),
            timedOut,
          });
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) workers.push(worker());
    await Promise.all(workers);

    report.aborted = this._aborted;
    report.durationMs = this._clock.now() - started;
    return report;
  }

  /**
   * Warm only the keys that are currently missing. `exists` is the
   * cache's membership check; keys already present are skipped so a
   * periodic re-warm is cheap.
   */
  async warmMissing(keys: readonly string[], exists: (key: string) => boolean): Promise<WarmReport> {
    return this.warm(keys.filter((k) => !exists(k)));
  }

  private async _loadOne(key: string): Promise<T> {
    const load = this._loader(key);
    if (this._perKeyTimeoutMs <= 0) return load;
    // Race the loader against a real-time deadline; losing the race
    // doesn't cancel the loader, it just stops being waited for.
    return Promise.race([load, realDelay(this._perKeyTimeoutMs)]);
  }
}
