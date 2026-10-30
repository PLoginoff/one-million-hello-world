/**
 * TokenBucket — a token-bucket rate limiter with injectable clock.
 *
 * Tokens accrue at `refillRatePerSec` up to `burst` capacity. `tryAcquire`
 * spends `cost` tokens when available, else reports the deficit and the
 * wait time until enough tokens regenerate — the value purge APIs need
 * to surface "rate limited, retry in N ms".
 *
 * @module CdnIntegration/Engines
 */

import { IClock, RateLimitPolicy, SystemClock } from './types';

export class TokenBucket {
  private readonly _refillPerMs: number;
  private readonly _capacity: number;
  private _tokens: number;
  private _lastRefill: number;
  private readonly _clock: IClock;

  constructor(policy: RateLimitPolicy, clock: IClock = new SystemClock()) {
    if (policy.refillRatePerSec <= 0) {
      throw new RangeError('refillRatePerSec must be positive');
    }
    if (policy.burst <= 0) {
      throw new RangeError('burst must be positive');
    }
    this._refillPerMs = policy.refillRatePerSec / 1000;
    this._capacity = policy.burst;
    this._tokens = policy.burst;
    this._clock = clock;
    this._lastRefill = clock.now();
  }

  /** Current token count after lazy refill. */
  tokens(): number {
    this._refill();
    return this._tokens;
  }

  /**
   * Try to spend `cost` tokens. On success returns `{ok:true}`; on
   * failure `{ok:false, retryAfterMs}` — the time until enough tokens
   * will have regenerated.
   */
  tryAcquire(cost = 1): { ok: true } | { ok: false; retryAfterMs: number } {
    this._refill();
    if (this._tokens >= cost) {
      this._tokens -= cost;
      return { ok: true };
    }
    const deficit = cost - this._tokens;
    return { ok: false, retryAfterMs: Math.ceil(deficit / this._refillPerMs) };
  }

  /** Wait until `cost` tokens are available (advisory: reports the ms). */
  waitTimeMs(cost = 1): number {
    this._refill();
    if (this._tokens >= cost) return 0;
    return Math.ceil((cost - this._tokens) / this._refillPerMs);
  }

  /** Force-set tokens (testing). */
  setTokens(n: number): void {
    this._tokens = Math.min(this._capacity, Math.max(0, n));
  }

  private _refill(): void {
    const now = this._clock.now();
    const elapsed = now - this._lastRefill;
    if (elapsed <= 0) return;
    this._tokens = Math.min(this._capacity, this._tokens + elapsed * this._refillPerMs);
    this._lastRefill = now;
  }
}
