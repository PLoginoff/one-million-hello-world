/**
 * Token-Bucket Retry Budget per Route
 *
 * `RetryBudget` (HealthTracker.ts) bounds *concurrent* retries as a ratio
 * of in-flight requests. This module enforces the other classic limit:
 * a RATE. Each route gets a token bucket:
 *
 *   - `capacity` tokens max; refills at `refillPerSecond`.
 *   - A retry consumes 1 token; empty bucket → retry refused → the
 *     request fails fast instead of amplifying an outage.
 *   - Regular requests never consume tokens — only retries.
 *
 * Why both limits? The ratio cap stops retries exceeding 20% of CURRENT
 * traffic, but during a full outage request volume collapses → the ratio
 * cap allows 0 retries while the error rate still demands them, OR
 * (worse) low-but-steady traffic allows a constant retry drip that keeps
 * a sick upstream saturated. The token bucket bounds the absolute retry
 * rate regardless of traffic shape.
 *
 * Tokens refill continuously: tokens += rate × dt, capped at capacity.
 * Refill math is lazy (computed on acquire), no timers needed.
 *
 * @module ServiceMeshLayer/Engine
 */

import { IClock, SystemClock } from '../../observability/engine/signals';

export interface RetryBudgetConfig {
  /** Max tokens (burst size). Default 100. */
  readonly capacity?: number;
  /** Tokens per second refill. Default 20. */
  readonly refillPerSecond?: number;
  /** Initial tokens — defaults to capacity (budget starts full). */
  readonly initialTokens?: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
  /** Lifetime stats. */
  granted: number;
  denied: number;
}

export class RetryBudgetPool {
  private readonly _capacity: number;
  private readonly _rate: number;
  private readonly _initial: number;
  private readonly _clock: IClock;
  private readonly _buckets = new Map<string, Bucket>();

  constructor(config: RetryBudgetConfig = {}, clock: IClock = new SystemClock()) {
    this._capacity = config.capacity ?? 100;
    this._rate = config.refillPerSecond ?? 20;
    this._initial = config.initialTokens ?? this._capacity;
    this._clock = clock;
  }

  private _bucket(route: string): Bucket {
    let b = this._buckets.get(route);
    if (!b) {
      b = { tokens: this._initial, lastRefillMs: this._clock.nowMs(), granted: 0, denied: 0 };
      this._buckets.set(route, b);
    }
    return b;
  }

  private _refill(b: Bucket): void {
    const now = this._clock.nowMs();
    const dt = (now - b.lastRefillMs) / 1000;
    if (dt <= 0) return;
    b.tokens = Math.min(this._capacity, b.tokens + dt * this._rate);
    b.lastRefillMs = now;
  }

  /** May `route` retry now? Consumes a token if granted. */
  tryAcquireRetry(route: string): boolean {
    const b = this._bucket(route);
    this._refill(b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      b.granted++;
      return true;
    }
    b.denied++;
    return false;
  }

  /** Peek without consuming (admission hint for callers). */
  canRetry(route: string): boolean {
    const b = this._bucket(route);
    this._refill(b);
    return b.tokens >= 1;
  }

  /** Current token level (fraction 0..1 of capacity) for metrics. */
  level(route: string): number {
    const b = this._bucket(route);
    this._refill(b);
    return b.tokens / this._capacity;
  }

  stats(route: string): { tokens: number; granted: number; denied: number } {
    const b = this._bucket(route);
    this._refill(b);
    return { tokens: b.tokens, granted: b.granted, denied: b.denied };
  }

  /** Denied share of all retry attempts — alert-worthy when high. */
  deniedRatio(route: string): number {
    const s = this.stats(route);
    const total = s.granted + s.denied;
    return total === 0 ? 0 : s.denied / total;
  }

  routes(): string[] {
    return [...this._buckets.keys()];
  }
}
