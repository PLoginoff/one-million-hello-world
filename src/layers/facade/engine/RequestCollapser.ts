/**
 * RequestCollapser — deduplicates concurrent identical facade calls.
 *
 * When ten requests for `/user/42` arrive within a millisecond, a
 * naive facade issues ten identical backend calls. This collapser
 * shares one in-flight call among all waiters on the same key —
 * similar to `SingleFlightCache` but scoped to *concurrent requests*
 * only (no value caching; caching is `CachedFacade`'s job):
 *
 *   req1..req10 ──key──▶ one underlying call ──▶ all resolve
 *
 *   - keys are caller-computed (same `keyFn` pattern as CachedFacade);
 *   - a late arrival joining an in-flight call waits on its promise;
 *   - `maxJoiners` bounds the fan-in per key;
 *   - failures propagate to all joiners (and are NOT retained — the
 *     next caller starts a fresh call);
 *   - optional `staleAfterMs` collapses only within a freshness window:
 *     two identical calls 5s apart get separate executions.
 *
 * @module FacadeLayer/Engine
 */

import { FacadeEngineClock, SystemEngineClock } from './types';

export class CollapseLimitError extends Error {
  readonly key: unknown;
  constructor(key: unknown, max: number) {
    super(`Too many joiners (${max}) on in-flight call for key ${String(key)}`);
    this.name = 'CollapseLimitError';
    this.key = key;
  }
}

export interface CollapserOptions<A extends readonly unknown[], R> {
  keyFn: (...args: A) => unknown;
  fn: (...args: A) => Promise<R>;
  /** Max joiners per in-flight call. Default 64. */
  maxJoiners?: number;
  /** Two calls with the same key collapse only if within this window (ms). 0 = infinite. */
  staleAfterMs?: number;
  clock?: FacadeEngineClock;
}

export interface CollapserStats {
  /** Calls that started a real underlying invocation. */
  leaders: number;
  /** Calls that joined an in-flight one. */
  joiners: number;
  /** Rejected by the joiner cap. */
  rejected: number;
  /** Currently in-flight keys. */
  inFlight: number;
}

interface InFlightCall<R> {
  promise: Promise<R>;
  startedAt: number;
  joiners: number;
}

export class RequestCollapser<A extends readonly unknown[], R> {
  private readonly _clock: FacadeEngineClock;
  private readonly _keyFn: (...args: A) => unknown;
  private readonly _fn: (...args: A) => Promise<R>;
  private readonly _maxJoiners: number;
  private readonly _staleAfterMs: number;

  private readonly _inFlight = new Map<unknown, InFlightCall<R>>();

  private _leaders = 0;
  private _joiners = 0;
  private _rejected = 0;

  constructor(options: CollapserOptions<A, R>) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._keyFn = options.keyFn;
    this._fn = options.fn;
    this._maxJoiners = Math.max(1, options.maxJoiners ?? 64);
    this._staleAfterMs = Math.max(0, options.staleAfterMs ?? 0);
  }

  /**
   * Call through the collapser. If a call with the same key is
   * in-flight (and fresh), joins its promise instead of starting a
   * new one.
   */
  async call(...args: A): Promise<R> {
    const key = this._keyFn(...args);
    const now = this._clock.now();
    const existing = this._inFlight.get(key);
    if (existing) {
      const fresh = this._staleAfterMs <= 0 || now - existing.startedAt <= this._staleAfterMs;
      if (fresh) {
        if (existing.joiners >= this._maxJoiners) {
          this._rejected++;
          throw new CollapseLimitError(key, this._maxJoiners);
        }
        existing.joiners++;
        this._joiners++;
        return existing.promise;
      }
      // Stale — replace the in-flight record; old callers still get their own promise.
    }

    const record: InFlightCall<R> = {
      joiners: 0,
      startedAt: now,
      promise: Promise.resolve()
        .then(() => this._fn(...args)),
    };
    this._leaders++;
    this._inFlight.set(key, record);
    record.promise
      .catch(() => undefined)
      .finally(() => {
        if (this._inFlight.get(key) === record) this._inFlight.delete(key);
      });
    return record.promise;
  }

  stats(): CollapserStats {
    return {
      leaders: this._leaders,
      joiners: this._joiners,
      rejected: this._rejected,
      inFlight: this._inFlight.size,
    };
  }
}
