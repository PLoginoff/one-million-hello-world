/**
 * Endpoint Health Tracking & Outlier Ejection
 *
 * Implements Envoy-style outlier detection per cluster:
 *
 *   - Each endpoint keeps a sliding count of consecutive 5xx results.
 *   - When `consecutive5xx` threshold is hit, the endpoint is ejected
 *     for `baseEjectionMs * 2^(ejectionCount-1)`, capped at
 *     `maxEjectionMs`.
 *   - Ejection is bounded: if ejecting would push the ejected fraction
 *     above `maxEjectionPercent`, the endpoint is kept (panic mode
 *     prevention — better slow than no endpoints).
 *   - After the ejection expires the endpoint is re-admitted and the
 *     counter resets; a further failure re-ejects with exponential
 *     backoff.
 *
 * `RetryBudget` enforces a retry token-bucket per route: active retries
 * may not exceed `budgetPercent` of in-flight requests nor `budgetMax`
 * absolute — this keeps a flapping upstream from amplifying itself.
 *
 * @module ServiceMeshLayer/Engine
 */

import { OutlierDetectionConfig } from './config-model';
import { IClock, SystemClock } from '../../observability/engine/signals';

export type RequestResult = 'success' | 'error-4xx' | 'error-5xx' | 'timeout' | 'reset';

interface EndpointHealth {
  consecutive5xx: number;
  ejectedUntilMs: number;
  ejectionCount: number;
  /** Results seen in the current analysis interval. */
  window: { total: number; errors: number };
}

export interface EndpointState {
  readonly endpoint: string;
  readonly ejected: boolean;
  readonly ejectedUntilMs: number;
  readonly ejectionCount: number;
  readonly consecutive5xx: number;
}

/**
 * Tracks per-endpoint health for one cluster. Keys are `address:port`.
 */
export class OutlierDetector {
  private readonly _config: OutlierDetectionConfig;
  private readonly _clock: IClock;
  private readonly _endpoints: Map<string, EndpointHealth> = new Map();
  private _lastIntervalMs: number;

  constructor(config: OutlierDetectionConfig, clock: IClock = new SystemClock()) {
    this._config = config;
    this._clock = clock;
    this._lastIntervalMs = clock.nowMs();
  }

  register(endpointKey: string): void {
    if (!this._endpoints.has(endpointKey)) {
      this._endpoints.set(endpointKey, {
        consecutive5xx: 0,
        ejectedUntilMs: 0,
        ejectionCount: 0,
        window: { total: 0, errors: 0 },
      });
    }
  }

  /** Record the outcome of a request to an endpoint. */
  record(endpointKey: string, result: RequestResult): void {
    this._maybeRollInterval();
    this.register(endpointKey);
    const h = this._endpoints.get(endpointKey)!;
    h.window.total++;
    const isServerError = result === 'error-5xx' || result === 'timeout' || result === 'reset';
    if (isServerError) {
      h.window.errors++;
      h.consecutive5xx++;
      if (h.consecutive5xx >= this._config.consecutive5xx && !this.isEjected(endpointKey)) {
        this._tryEject(endpointKey, h);
      }
    } else {
      // Successes (and 4xx, which are caller's fault) reset the streak.
      h.consecutive5xx = 0;
    }
  }

  private _tryEject(endpointKey: string, h: EndpointHealth): void {
    if (this._ejectionCapped()) return; // panic-mode prevention
    h.ejectionCount++;
    const backoff = Math.min(
      this._config.maxEjectionMs,
      this._config.baseEjectionMs * Math.pow(2, h.ejectionCount - 1)
    );
    h.ejectedUntilMs = this._clock.nowMs() + backoff;
  }

  private _ejectionCapped(): boolean {
    const total = this._endpoints.size;
    if (total === 0) return false;
    const ejected = this.ejectedCount();
    return (ejected / total) * 100 >= this._config.maxEjectionPercent;
  }

  isEjected(endpointKey: string): boolean {
    const h = this._endpoints.get(endpointKey);
    return !!h && h.ejectedUntilMs > this._clock.nowMs();
  }

  /** Endpoints currently available to the load balancer. */
  healthyEndpoints(): string[] {
    const now = this._clock.nowMs();
    const out: string[] = [];
    for (const [k, h] of this._endpoints) {
      if (h.ejectedUntilMs <= now) out.push(k);
    }
    return out;
  }

  ejectedCount(): number {
    const now = this._clock.nowMs();
    let n = 0;
    for (const h of this._endpoints.values()) {
      if (h.ejectedUntilMs > now) n++;
    }
    return n;
  }

  state(endpointKey: string): EndpointState | undefined {
    const h = this._endpoints.get(endpointKey);
    if (!h) return undefined;
    return {
      endpoint: endpointKey,
      ejected: h.ejectedUntilMs > this._clock.nowMs(),
      ejectedUntilMs: h.ejectedUntilMs,
      ejectionCount: h.ejectionCount,
      consecutive5xx: h.consecutive5xx,
    };
  }

  private _maybeRollInterval(): void {
    const now = this._clock.nowMs();
    if (now - this._lastIntervalMs >= this._config.intervalMs) {
      this._lastIntervalMs = now;
      for (const h of this._endpoints.values()) {
        h.window = { total: 0, errors: 0 };
      }
    }
  }
}

/**
 * Retry budget: retries consume a share of in-flight requests. Requests
 * are admitted via `tryAcquire`; `release` returns the slot. A retry may
 * not exceed `maxRetries` concurrent nor `ratio` × active requests.
 */
export class RetryBudget {
  private _activeRequests = 0;
  private _activeRetries = 0;
  private readonly _ratio: number;
  private readonly _maxRetries: number;

  constructor(ratio = 0.2, maxRetries = 1000) {
    this._ratio = ratio;
    this._maxRetries = maxRetries;
  }

  requestStarted(): void {
    this._activeRequests++;
  }

  requestFinished(): void {
    this._activeRequests = Math.max(0, this._activeRequests - 1);
  }

  /** May we retry? Requires capacity under both bounds. */
  canRetry(): boolean {
    if (this._activeRetries >= this._maxRetries) return false;
    // Ratio bound: retries ≤ ratio × requests (with a floor of 3 to keep
    // a trickle of retries possible on low-traffic routes).
    const allowedByRatio = Math.max(3, Math.floor(this._activeRequests * this._ratio));
    return this._activeRetries < allowedByRatio;
  }

  retryStarted(): boolean {
    if (!this.canRetry()) return false;
    this._activeRetries++;
    return true;
  }

  retryFinished(): void {
    this._activeRetries = Math.max(0, this._activeRetries - 1);
  }

  get activeRetries(): number {
    return this._activeRetries;
  }

  get activeRequests(): number {
    return this._activeRequests;
  }
}

/**
 * Syncs circuit-breaker state across the control plane: per-route
 * status (closed/open/half-open) is computed from a shared error-rate
 * window so sidecars agree on when to stop sending traffic.
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreakerSync {
  private readonly _errorThreshold: number; // fraction 0-1
  private readonly _windowMs: number;
  private readonly _sleepMs: number;
  private readonly _clock: IClock;
  private readonly _routes: Map<
    string,
    { state: CircuitState; openedAtMs: number; successes: number; failures: number; windowStart: number }
  > = new Map();

  constructor(opts: { errorThreshold?: number; windowMs?: number; sleepMs?: number } = {}, clock: IClock = new SystemClock()) {
    this._errorThreshold = opts.errorThreshold ?? 0.5;
    this._windowMs = opts.windowMs ?? 30_000;
    this._sleepMs = opts.sleepMs ?? 5_000;
    this._clock = clock;
  }

  record(route: string, ok: boolean): CircuitState {
    const now = this._clock.nowMs();
    let r = this._routes.get(route);
    if (!r) {
      r = { state: 'closed', openedAtMs: 0, successes: 0, failures: 0, windowStart: now };
      this._routes.set(route, r);
    }
    // Roll the window.
    if (now - r.windowStart >= this._windowMs) {
      r.windowStart = now;
      r.successes = 0;
      r.failures = 0;
    }
    if (ok) r.successes++;
    else r.failures++;

    const total = r.successes + r.failures;
    const errorRate = total === 0 ? 0 : r.failures / total;
    switch (r.state) {
      case 'closed':
        if (total >= 5 && errorRate >= this._errorThreshold) {
          r.state = 'open';
          r.openedAtMs = now;
        }
        break;
      case 'open':
        if (now - r.openedAtMs >= this._sleepMs) {
          r.state = 'half-open';
          // Evaluate the probe outcome immediately.
          if (ok) {
            r.state = 'closed';
            r.successes = 0;
            r.failures = 0;
          } else {
            r.state = 'open';
            r.openedAtMs = now;
          }
        }
        break;
      case 'half-open':
        if (ok) {
          r.state = 'closed';
          r.successes = 0;
          r.failures = 0;
        } else {
          r.state = 'open';
          r.openedAtMs = now;
        }
        break;
    }
    return r.state;
  }

  stateOf(route: string): CircuitState {
    return this._routes.get(route)?.state ?? 'closed';
  }
}
