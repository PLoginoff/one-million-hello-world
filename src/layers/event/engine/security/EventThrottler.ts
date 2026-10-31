/**
 * EventThrottler — token-bucket + sliding-window write-side rate limiting.
 *
 * An append-only log with no write limit is a disk bomb: one buggy producer
 * emitting in a loop fills the log faster than consumers can drain. Real
 * event stores throttle at the append edge (Kafka quotas, EventStoreDB
 * write limits). This adds that backpressure surface.
 *
 * Two limiters, composable:
 *
 *   Token bucket — the burst-friendly limiter. Tokens refill at `rate/sec`
 *     up to `capacity`; each emit costs tokens proportional to batch size.
 *     Bursts up to `capacity` pass instantly, then the sustained rate kicks
 *     in — the shape real traffic actually has (idle → burst → idle).
 *
 *   Sliding window — the hard cap. Counts emits in the trailing `windowMs`;
 *     over `maxPerWindow` → reject regardless of burst capacity. Catches
 *     the pathological case a token bucket can't: a producer that stays
 *     exactly at the refill rate forever (the window sees the true count).
 *
 * `check` is non-mutating (peek — "would this emit be allowed?"), `consume`
 * is atomic test-and-take. Both clock-injectable for deterministic tests.
 *
 * @module EventLayer/Engine/Security
 */

export interface ThrottleOptions {
  /** Sustained rate: tokens per second. Default 100. */
  readonly ratePerSec?: number;
  /** Burst capacity (max tokens). Default 200. */
  readonly capacity?: number;
  /** Hard cap: emits per sliding window. Default 1000 per windowMs. */
  readonly maxPerWindow?: number;
  /** Sliding window size (ms). Default 60000. */
  readonly windowMs?: number;
  readonly clock?: () => number;
}

export interface ThrottleDecision {
  readonly allowed: boolean;
  /** Why not — 'rate' (token bucket empty) or 'window' (hard cap hit). */
  readonly reason?: 'rate' | 'window';
  /** Milliseconds until enough tokens refill for `cost` (when reason='rate'). */
  readonly retryAfterMs?: number;
}

export class EventThrottler {
  private readonly ratePerSec: number;
  private readonly capacity: number;
  private readonly maxPerWindow: number;
  private readonly windowMs: number;
  private readonly clock: () => number;
  private tokens: number;
  private lastRefillAt: number;
  /** Sliding-window timestamps (emit times in the trailing window). */
  private readonly window: number[] = [];
  private throttled = 0;
  private allowed = 0;

  constructor(options: ThrottleOptions = {}) {
    this.ratePerSec = options.ratePerSec ?? 100;
    this.capacity = options.capacity ?? 200;
    this.maxPerWindow = options.maxPerWindow ?? 1_000;
    this.windowMs = options.windowMs ?? 60_000;
    this.clock = options.clock ?? Date.now;
    this.tokens = this.capacity;
    this.lastRefillAt = this.clock();
  }

  /** Peeks whether `cost` events could emit now (no state change). */
  check(cost = 1): ThrottleDecision {
    this.refill();
    if (this.tokens >= cost && this.windowCount() + cost <= this.maxPerWindow) {
      return { allowed: true };
    }
    if (this.tokens < cost) {
      const deficit = cost - this.tokens;
      return {
        allowed: false,
        reason: 'rate',
        retryAfterMs: Math.ceil((deficit / this.ratePerSec) * 1000),
      };
    }
    return { allowed: false, reason: 'window' };
  }

  /**
   * Atomic test-and-take: if allowed, consumes `cost` tokens and records the
   * emit in the sliding window — the burst-race a `check(); emit();` pair
   * would lose.
   */
  consume(cost = 1): ThrottleDecision {
    const d = this.check(cost);
    if (!d.allowed) {
      this.throttled++;
      return d;
    }
    this.tokens -= cost;
    const now = this.clock();
    for (let i = 0; i < cost; i++) this.window.push(now);
    this.allowed++;
    return { allowed: true };
  }

  /**
   * Emits through the throttle: calls `fn` only when `cost` events are
   * allowed, returning its result or throwing when throttled.
   */
  through<R>(cost: number, fn: () => R): R {
    const d = this.consume(cost);
    if (!d.allowed) {
      const err = new Error(
        `Write throttled (${d.reason}): retry in ${d.retryAfterMs ?? 0}ms`
      );
      (err as { code?: string }).code = 'THROTTLED';
      throw err;
    }
    return fn();
  }

  /** Tokens currently available (post-refill). */
  get availableTokens(): number {
    this.refill();
    return this.tokens;
  }

  get throttledCount(): number {
    return this.throttled;
  }

  get allowedCount(): number {
    return this.allowed;
  }

  /** Emits in the current sliding window (hard-cap usage). */
  windowCount(): number {
    const cutoff = this.clock() - this.windowMs;
    let i = 0;
    while (i < this.window.length && this.window[i] <= cutoff) i++;
    if (i > 0) this.window.splice(0, i);
    return this.window.length;
  }

  /**
   * Refills tokens for elapsed time: `tokens += elapsed·rate/1000`, capped at
   * capacity. Called lazily on every check/consume — no timers, no drift.
   */
  private refill(): void {
    const now = this.clock();
    const elapsedMs = now - this.lastRefillAt;
    if (elapsedMs <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + (elapsedMs * this.ratePerSec) / 1000);
    this.lastRefillAt = now;
  }
}
