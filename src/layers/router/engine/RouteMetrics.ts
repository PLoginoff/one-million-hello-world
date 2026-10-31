/**
 * Route Metrics — per-route hit counts, latency percentiles, and
 * error-rate tracking.
 *
 * Storage shape: a flat `Map<key, RouteMetrics>` keyed by
 * `method + ' ' + pattern` — the registration pattern, not the concrete
 * request path, so `/users/42` aggregates under `/users/:id` instead of
 * exploding cardinality.
 *
 * Latency reservoir: fixed-size ring buffer per route (default 1024
 * samples). Percentiles are computed by sorting a copy of the ring —
 * O(R log R) per query, R ≤ reservoir size — cheap because reservoirs
 * are bounded. The reservoir overwrites the oldest samples once full,
 * so percentiles reflect *recent* traffic, not lifetime history.
 *
 * @module RouterLayer/Engine
 */

import { HttpMethod } from '../types/router-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for {@link RouteMetricsCollector}. */
export interface RouteMetricsOptions {
  /** Per-route latency reservoir capacity (samples). Default 1024. */
  readonly reservoirSize?: number;
  /** Clock injection — defaults to Date.now. */
  readonly now?: () => number;
}

/** Per-route aggregated metrics. */
export interface RouteMetrics {
  /** Total dispatched requests. */
  readonly hits: number;
  /** Requests returning status >= 500. */
  readonly errors: number;
  /** Requests returning 4xx status. */
  readonly clientErrors: number;
  /** Success count (2xx/3xx). */
  readonly successes: number;
  /** Min/avg/max latency in ms. */
  readonly latencyMs: {
    readonly min: number;
    readonly max: number;
    readonly avg: number;
  };
  /** Percentiles over the recent-reservoir window. */
  readonly percentiles: {
    readonly p50: number;
    readonly p90: number;
    readonly p95: number;
    readonly p99: number;
  };
  /** Epoch ms of the last request (0 = never). */
  readonly lastHitAtMs: number;
}

/** Global metrics rollup. Named `RouteMetricsSnapshot` to avoid
 * collision with the strategies/ export of the same concept. */
export interface RouteMetricsSnapshot {
  readonly totalRequests: number;
  readonly totalErrors: number;
  readonly routes: ReadonlyMap<string, RouteMetrics>;
  readonly topRoutes: readonly { key: string; hits: number }[];
}

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

/** Internal mutable record — the public shape is computed on snapshot. */
interface RouteRecord {
  hits: number;
  errors: number;
  clientErrors: number;
  /** Ring buffer of recent latencies (ms). */
  ring: Float64Array;
  /** Next write position in the ring. */
  ringPos: number;
  /** Samples written so far (≤ ring.length once full). */
  ringCount: number;
  /** Running sum for O(1) avg. */
  sumMs: number;
  minMs: number;
  maxMs: number;
  lastHitAtMs: number;
}

/**
 * Per-route metrics collector.
 *
 * `record` is O(1) amortized: ring-buffer write + scalar updates.
 * `snapshot` is O(R) per route where R = reservoir size.
 */
export class RouteMetricsCollector {
  private readonly _records: Map<string, RouteRecord>;
  private readonly _reservoirSize: number;
  private readonly _now: () => number;
  private _totalRequests: number;

  constructor(options?: RouteMetricsOptions) {
    this._records = new Map();
    this._reservoirSize = options?.reservoirSize ?? 1024;
    this._now = options?.now ?? (() => Date.now());
    this._totalRequests = 0;
  }

  /**
   * Record one dispatch.
   *
   * @param method   HTTP method.
   * @param pattern  Matched route pattern (`/users/:id`), not the raw path.
   * @param status   Response status code.
   * @param latencyMs End-to-end dispatch time.
   */
  record(method: HttpMethod, pattern: string, status: number, latencyMs: number): void {
    const key = `${method} ${pattern}`;
    let rec = this._records.get(key);
    if (rec === undefined) {
      rec = {
        hits: 0,
        errors: 0,
        clientErrors: 0,
        ring: new Float64Array(this._reservoirSize),
        ringPos: 0,
        ringCount: 0,
        sumMs: 0,
        minMs: Number.POSITIVE_INFINITY,
        maxMs: 0,
        lastHitAtMs: 0,
      };
      this._records.set(key, rec);
    }

    rec.hits += 1;
    this._totalRequests += 1;
    if (status >= 500) {
      rec.errors += 1;
    } else if (status >= 400) {
      rec.clientErrors += 1;
    }

    // Ring-buffer write — when full we overwrite the oldest sample but
    // keep the running sum accurate by subtracting the evicted value.
    if (rec.ringCount < this._reservoirSize) {
      rec.ring[rec.ringPos] = latencyMs;
      rec.ringCount += 1;
      rec.sumMs += latencyMs;
    } else {
      const evicted = rec.ring[rec.ringPos];
      rec.ring[rec.ringPos] = latencyMs;
      rec.sumMs += latencyMs - evicted;
    }
    rec.ringPos = (rec.ringPos + 1) % this._reservoirSize;

    rec.minMs = Math.min(rec.minMs, latencyMs);
    rec.maxMs = Math.max(rec.maxMs, latencyMs);
    rec.lastHitAtMs = this._now();
  }

  /** Aggregated metrics for one route key (`'GET /users/:id'`). */
  metricsFor(method: HttpMethod, pattern: string): RouteMetrics | undefined {
    const rec = this._records.get(`${method} ${pattern}`);
    if (rec === undefined) {
      return undefined;
    }
    return this.toMetrics(rec);
  }

  /** Aggregated metrics across all recorded routes. */
  snapshot(): RouteMetricsSnapshot {
    const routes = new Map<string, RouteMetrics>();
    let totalErrors = 0;
    for (const [key, rec] of this._records.entries()) {
      routes.set(key, this.toMetrics(rec));
      totalErrors += rec.errors;
    }
    const topRoutes = [...routes.entries()]
      .map(([key, m]) => ({ key, hits: m.hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);
    return {
      totalRequests: this._totalRequests,
      totalErrors,
      routes,
      topRoutes,
    };
  }

  /** Error rate for a route in [0, 1]. */
  errorRate(method: HttpMethod, pattern: string): number {
    const rec = this._records.get(`${method} ${pattern}`);
    if (rec === undefined || rec.hits === 0) {
      return 0;
    }
    return rec.errors / rec.hits;
  }

  /** Clear all records. */
  reset(): void {
    this._records.clear();
    this._totalRequests = 0;
  }

  /** Number of tracked route keys. */
  get routeCount(): number {
    return this._records.size;
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private toMetrics(rec: RouteRecord): RouteMetrics {
    const n = rec.ringCount;
    const avg = n > 0 ? rec.sumMs / n : 0;

    // Copy+sort the live reservoir slice for percentile queries.
    // Ring is not ordered — sort a fresh array to keep record() cheap.
    const sorted = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      sorted[i] = rec.ring[i];
    }
    sorted.sort();

    return {
      hits: rec.hits,
      errors: rec.errors,
      clientErrors: rec.clientErrors,
      successes: rec.hits - rec.errors - rec.clientErrors,
      latencyMs: {
        min: n > 0 ? rec.minMs : 0,
        max: rec.maxMs,
        avg,
      },
      percentiles: {
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
      },
      lastHitAtMs: rec.lastHitAtMs,
    };
  }
}

/** Nearest-rank percentile over an ascending sorted array. */
function percentile(sorted: Float64Array, q: number): number {
  const n = sorted.length;
  if (n === 0) {
    return 0;
  }
  const idx = Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1));
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Instrumenting middleware / dispatch wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a dispatch function so every request records latency + status
 * into the collector under the route's *pattern* key.
 *
 * Use when dispatch doesn't return the matched pattern — the caller
 * supplies `patternFor(method, path)` to resolve the aggregate key.
 */
export function instrumentedDispatch<T extends { status: number; matchedPattern?: string }>(
  collector: RouteMetricsCollector,
  dispatch: (method: HttpMethod, path: string) => Promise<T>,
  patternFor?: (method: HttpMethod, path: string) => string
): (method: HttpMethod, path: string) => Promise<T> {
  return async (method, path) => {
    const start = collectorStart();
    const result = await dispatch(method, path);
    const elapsed = collectorStart() - start;
    const pattern = result.matchedPattern ?? patternFor?.(method, path) ?? path;
    collector.record(method, pattern, result.status, elapsed);
    return result;
  };
}

function collectorStart(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
