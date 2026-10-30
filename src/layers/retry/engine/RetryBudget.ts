/**
 * RetryBudget — token bucket bounding retry rate (Google SRE pattern).
 *
 * Unbounded retries turn a partial outage into a full one: every client
 * hammering a struggling dependency multiplies its load exactly when it
 * can least afford it. The SRE rule of thumb is "retries should stay
 * below ~10% of request volume"; a token bucket implements that bound
 * mechanically:
 *
 *   - capacity `maxTokens`, refill `refillPerSecond` tokens/sec;
 *   - `tryAcquire(cost)` spends tokens if available, else returns false;
 *   - `acquire` throws `RetryBudgetExhaustedError` — the engine treats
 *     exhaustion as a signal to fail fast with the ORIGINAL error
 *     rather than retry into an already-overloaded backend.
 *
 * Scopes: budgets are per-scope (per-dependency, per-endpoint) — an
 * exhaustion in one dependency doesn't freeze retries elsewhere. A
 * `RetryBudgetRegistry` hands out named buckets.
 *
 * Time is read from an injectable clock so refill is deterministic in
 * tests — call `accrue()` on access (lazy refill, O(1), no timers).
 *
 * Complexity: all operations O(1).
 *
 * @module RetryLayer/Engine
 */

import { RetryBudgetExhaustedError, RetryEngineClock, SystemEngineClock } from './types';

export interface RetryBudgetOptions {
  /** Bucket capacity (max burst of retries). */
  maxTokens: number;
  /** Refill rate (tokens per second). */
  refillPerSecond: number;
  /** Cost per retry. Default 1. */
  costPerRetry?: number;
  clock?: RetryEngineClock;
}

export interface BudgetSnapshot {
  scope: string;
  tokens: number;
  maxTokens: number;
  refillPerSecond: number;
  totalAcquired: number;
  totalDenied: number;
}

export class RetryBudget {
  readonly scope: string;

  private readonly _clock: RetryEngineClock;
  private readonly _maxTokens: number;
  private readonly _refillPerMs: number;
  private readonly _cost: number;

  private _tokens: number;
  private _lastAccrualMs: number;
  private _totalAcquired = 0;
  private _totalDenied = 0;

  constructor(scope: string, options: RetryBudgetOptions) {
    this.scope = scope;
    this._clock = options.clock ?? new SystemEngineClock();
    this._maxTokens = Math.max(1, options.maxTokens);
    this._refillPerMs = Math.max(0, options.refillPerSecond) / 1000;
    this._cost = Math.max(0, options.costPerRetry ?? 1);
    this._tokens = this._maxTokens;
    this._lastAccrualMs = this._clock.now();
  }

  /** Lazy refill: credit tokens earned since last access. O(1). */
  private _accrue(): void {
    const now = this._clock.now();
    const elapsed = now - this._lastAccrualMs;
    if (elapsed <= 0) return;
    this._tokens = Math.min(this._maxTokens, this._tokens + elapsed * this._refillPerMs);
    this._lastAccrualMs = now;
  }

  /** Spend `cost` tokens if available. */
  tryAcquire(cost: number = this._cost): boolean {
    this._accrue();
    if (this._tokens >= cost) {
      this._tokens -= cost;
      this._totalAcquired++;
      return true;
    }
    this._totalDenied++;
    return false;
  }

  /** Spend or throw `RetryBudgetExhaustedError`. */
  acquire(cost: number = this._cost): void {
    if (!this.tryAcquire(cost)) throw new RetryBudgetExhaustedError(this.scope);
  }

  /** Peek at remaining tokens without spending. */
  available(): number {
    this._accrue();
    return this._tokens;
  }

  /** ms until `cost` tokens will be available; 0 if available now. */
  msUntilAvailable(cost: number = this._cost): number {
    this._accrue();
    if (this._tokens >= cost) return 0;
    if (this._refillPerMs <= 0) return Infinity;
    return Math.ceil((cost - this._tokens) / this._refillPerMs);
  }

  /** Grant tokens manually (e.g. a success refunding a retry). */
  grant(tokens: number): void {
    this._tokens = Math.min(this._maxTokens, this._tokens + tokens);
  }

  snapshot(): BudgetSnapshot {
    this._accrue();
    return {
      scope: this.scope,
      tokens: this._tokens,
      maxTokens: this._maxTokens,
      refillPerSecond: this._refillPerMs * 1000,
      totalAcquired: this._totalAcquired,
      totalDenied: this._totalDenied,
    };
  }
}

/** Named budget buckets shared across an executor. */
export class RetryBudgetRegistry {
  private readonly _options: Omit<RetryBudgetOptions, 'clock'> & { clock?: RetryEngineClock };
  private readonly _clock: RetryEngineClock;
  private readonly _budgets = new Map<string, RetryBudget>();

  constructor(options: RetryBudgetOptions) {
    this._options = options;
    this._clock = options.clock ?? new SystemEngineClock();
  }

  forScope(scope: string): RetryBudget {
    let b = this._budgets.get(scope);
    if (!b) {
      b = new RetryBudget(scope, { ...this._options, clock: this._clock });
      this._budgets.set(scope, b);
    }
    return b;
  }

  snapshots(): BudgetSnapshot[] {
    return Array.from(this._budgets.values()).map((b) => b.snapshot());
  }

  /** How many scopes currently have budgets. */
  get size(): number {
    return this._budgets.size;
  }
}
