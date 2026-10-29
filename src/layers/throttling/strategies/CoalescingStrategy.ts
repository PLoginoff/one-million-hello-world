/**
 * Request coalescing (single-flight) — merges concurrent identical
 * requests into one execution.
 *
 * When `getOrRun(key, producer)` is called and an identical `key` already
 * has an in-flight execution, the caller attaches to the same promise
 * rather than starting a second execution — identical concurrent requests
 * collapse into one backend call. Result sharing ends when the promise
 * settles; subsequent calls re-execute (use a cache layer for TTL reuse).
 *
 * Optionally wraps an inner throttler — the merged call must still pass
 * admission, so coalescing reduces *upstream* pressure but still respects
 * downstream limits.
 *
 * Data structure: `Map<key, Promise>` + ref-count; entry evicted on settle.
 * O(1) per call.
 *
 * @module Throttling/Strategies
 */

import { ThrottleMetrics, emptyMetrics } from '../domain/throttle-model';
import { ConcurrencyLimiterStrategy } from './ConcurrencyLimiterStrategy';

/** Optional key canonicalizer — deduplicates semantically-equal keys. */
export type KeyFn<K> = (key: K) => string;

export interface CoalescingOptions<K = string> {
  /** How request keys map to dedup keys. Default: identity/stringify. */
  readonly keyFn?: K extends string ? never : KeyFn<K>;
  /** Optional inner limiter — merged calls still respect its cap. */
  readonly limiter?: ConcurrencyLimiterStrategy;
}

export class CoalescingStrategy<K = string> {
  readonly name = 'coalescing';

  private readonly _inFlight = new Map<string, Promise<unknown>>();
  private readonly _refCounts = new Map<string, number>();
  private readonly _keyFn: (k: K) => string;
  private readonly _limiter?: ConcurrencyLimiterStrategy;
  private readonly _metrics: ThrottleMetrics = emptyMetrics();

  constructor(options: CoalescingOptions<K> = {}) {
    this._keyFn = options.keyFn !== undefined ? (options.keyFn as KeyFn<K>) : (k: K) => String(k);
    this._limiter = options.limiter;
  }

  metrics(): ThrottleMetrics {
    return { ...this._metrics, inFlight: this._inFlight.size };
  }

  /** Number of request streams currently merged into `key`'s execution. */
  inFlightCount(key: K): number {
    return this._refCounts.get(this._keyFn(key)) ?? 0;
  }

  /**
   * Returns the in-flight result for `key`, or starts `producer`.
   * Concurrent callers share the same Promise — the producer runs once.
   */
  getOrRun<T>(key: K, producer: () => Promise<T>): Promise<T> {
    const k = this._keyFn(key);
    const existing = this._inFlight.get(k);
    if (existing) {
      this._metrics.coalesced++;
      this._refCounts.set(k, (this._refCounts.get(k) ?? 1) + 1);
      return existing as Promise<T>;
    }
    this._metrics.admitted++;
    this._refCounts.set(k, 1);

    const exec = this._limiter ? this._limiter.run(() => producer()) : producer();
    const shared = exec.finally(() => {
      // Evict on settle — the next caller re-executes.
      this._inFlight.delete(k);
      this._refCounts.delete(k);
    });
    // Prevent unhandled-rejection on the internal promise; callers get the
    // shared (handled) chain.
    this._inFlight.set(k, shared);
    shared.catch(() => undefined);
    return shared;
  }

  /** Stats for a key — how many callers are sharing one execution. */
  describe(key: K): { inFlight: boolean; waiters: number } {
    const k = this._keyFn(key);
    return {
      inFlight: this._inFlight.has(k),
      waiters: this._refCounts.get(k) ?? 0,
    };
  }
}
