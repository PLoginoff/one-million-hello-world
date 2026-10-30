/**
 * ProxyStatistics
 *
 * Introspection registry recording per-method and engine-wide invocation
 * telemetry: call counts, success/failure splits, cache hits, short-circuits,
 * last-invocation timestamps, and an exponentially-smoothed duration average.
 *
 * Data structure: a flat `Map<string, MethodStats>` keyed by method name —
 * O(1) record/lookup per invocation. Duration averaging uses EWMA
 * (exponentially weighted moving average) so the registry never retains
 * individual samples: O(1) memory per method regardless of call volume.
 *
 *   avg' = alpha * sample + (1 - alpha) * avg     (alpha = 0.2 by default)
 *
 * EWMA weights recent calls ~5x more than a simple mean over an infinite
 * window while remaining allocation-free.
 *
 * All mutation goes through `record*()` methods called by the proxy engine;
 * `snapshot()` returns a defensive copy safe for external consumers.
 *
 * @module ProxyLayer/Engine
 */

import { MethodStats, ProxyEngineStats } from './types';

/**
 * A single recorded call passed to `ProxyStatistics.record`.
 */
export interface CallRecord {
  readonly method: string;
  readonly durationMs: number;
  readonly at: number;
  readonly outcome: 'success' | 'failure' | 'cacheHit' | 'shortCircuit';
  readonly error?: string;
}

function emptyStats(): MethodStats {
  return {
    calls: 0,
    successes: 0,
    failures: 0,
    cacheHits: 0,
    shortCircuits: 0,
    lastInvokedAt: null,
    lastDurationMs: null,
    avgDurationMs: 0,
    lastError: null,
  };
}

/**
 * Mutable per-engine statistics collector.
 */
export class ProxyStatistics {
  private readonly _perMethod: Map<string, MethodStats>;
  private readonly _alpha: number;
  private _totalCalls: number;
  private _totalSuccesses: number;
  private _totalFailures: number;

  /**
   * @param alpha - EWMA smoothing factor in (0, 1]. Higher values track
   *   recent latency more aggressively. Default 0.2.
   */
  constructor(alpha = 0.2) {
    if (!(alpha > 0 && alpha <= 1)) {
      throw new RangeError(`alpha must be in (0, 1], got ${alpha}`);
    }
    this._alpha = alpha;
    this._perMethod = new Map();
    this._totalCalls = 0;
    this._totalSuccesses = 0;
    this._totalFailures = 0;
  }

  /**
   * Records a completed call. Called exactly once per engine invocation
   * by ProxyEngine internals.
   */
  record(rec: CallRecord): void {
    const stats = this._perMethod.get(rec.method) ?? emptyStats();
    stats.calls += 1;
    stats.lastInvokedAt = rec.at;
    this._totalCalls += 1;

    switch (rec.outcome) {
      case 'success':
        stats.successes += 1;
        this._totalSuccesses += 1;
        break;
      case 'cacheHit':
        stats.cacheHits += 1;
        stats.successes += 1;
        this._totalSuccesses += 1;
        break;
      case 'shortCircuit':
        stats.shortCircuits += 1;
        stats.successes += 1;
        this._totalSuccesses += 1;
        break;
      case 'failure':
        stats.failures += 1;
        this._totalFailures += 1;
        stats.lastError = rec.error ?? 'unknown error';
        break;
    }

    if (rec.outcome !== 'failure') {
      stats.lastDurationMs = rec.durationMs;
      stats.avgDurationMs =
        stats.avgDurationMs === 0
          ? rec.durationMs
          : this._alpha * rec.durationMs + (1 - this._alpha) * stats.avgDurationMs;
    }

    this._perMethod.set(rec.method, stats);
  }

  /**
   * Per-method stats for `method`, or an empty record when never called.
   * Returns a copy — mutating it does not affect the registry.
   */
  forMethod(method: string): MethodStats {
    const stats = this._perMethod.get(method);
    return stats ? { ...stats } : emptyStats();
  }

  /**
   * Engine-wide snapshot. Defensive copy on every call: O(m) where
   * m = number of distinct methods seen.
   */
  snapshot(): ProxyEngineStats {
    const methods: Record<string, MethodStats> = {};
    for (const [name, stats] of this._perMethod) {
      methods[name] = { ...stats };
    }
    return {
      totalCalls: this._totalCalls,
      totalSuccesses: this._totalSuccesses,
      totalFailures: this._totalFailures,
      methods,
    };
  }

  /**
   * Names of every method ever invoked, sorted alphabetically.
   */
  knownMethods(): string[] {
    return [...this._perMethod.keys()].sort();
  }

  /**
   * Returns the `n` most-called methods, ties broken alphabetically.
   * O(m log m) — intended for diagnostics, not hot paths.
   */
  hottest(n: number): ReadonlyArray<{ method: string; calls: number }> {
    return [...this._perMethod.entries()]
      .map(([method, stats]) => ({ method, calls: stats.calls }))
      .sort((a, b) => b.calls - a.calls || a.method.localeCompare(b.method))
      .slice(0, Math.max(0, n));
  }

  /**
   * Resets all counters. Primarily for tests and metric rotation windows.
   */
  reset(): void {
    this._perMethod.clear();
    this._totalCalls = 0;
    this._totalSuccesses = 0;
    this._totalFailures = 0;
  }
}
