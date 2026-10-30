/**
 * RetrySession — a retry operation's total deadline across attempts.
 *
 * `RetryEngine` bounds *per-attempt* behavior (max attempts, per-attempt
 * delay). A session bounds the *whole operation*: no retry is started
 * once the session deadline is exhausted, and the remaining budget is
 * reported so the caller can pass it down as a per-attempt timeout.
 *
 *   deadline = startMs + totalBudgetMs
 *   remaining() = deadline - now
 *
 * This is the gRPC "deadline propagates through retries" pattern: a
 * caller that gave the operation 3s doesn't want attempt-3's backoff
 * to push total wall time past 3s — the session refuses the retry when
 * `remaining < minRequiredMs`.
 *
 * @module RetryLayer/Engine
 */

import { RetryEngineClock, SystemEngineClock } from './types';

export class RetrySessionExpiredError extends Error {
  readonly budgetMs: number;
  constructor(budgetMs: number) {
    super(`Retry session budget of ${budgetMs}ms exhausted`);
    this.name = 'RetrySessionExpiredError';
    this.budgetMs = budgetMs;
  }
}

export interface RetrySessionOptions {
  /** Total wall-clock budget for all attempts (ms). */
  totalBudgetMs: number;
  /**
   * Refuse a new attempt when less than this remains (ms) — a retry
   * needs at least enough time to plausibly succeed. Default 0.
   */
  minRequiredMs?: number;
  clock?: RetryEngineClock;
}

export class RetrySession {
  private readonly _clock: RetryEngineClock;
  private readonly _startMs: number;
  private readonly _budgetMs: number;
  private readonly _minRequiredMs: number;

  constructor(options: RetrySessionOptions) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._startMs = this._clock.now();
    this._budgetMs = Math.max(0, options.totalBudgetMs);
    this._minRequiredMs = Math.max(0, options.minRequiredMs ?? 0);
  }

  /** ms of budget remaining (can be negative once expired). */
  remaining(): number {
    return this._startMs + this._budgetMs - this._clock.now();
  }

  /** ms elapsed since session start. */
  elapsed(): number {
    return this._clock.now() - this._startMs;
  }

  /** True when there's enough budget to attempt once more. */
  canAttempt(): boolean {
    return this.remaining() > this._minRequiredMs;
  }

  /** Throw `RetrySessionExpiredError` when out of budget. */
  requireBudget(): void {
    if (!this.canAttempt()) throw new RetrySessionExpiredError(this._budgetMs);
  }

  /**
   * Per-attempt timeout derived from remaining budget — pass to the
   * underlying call so the attempt can't overrun the session.
   */
  attemptTimeoutMs(maxPerAttemptMs = Infinity): number {
    const remaining = Math.max(0, this.remaining() - this._minRequiredMs);
    return Math.min(maxPerAttemptMs, remaining);
  }
}
