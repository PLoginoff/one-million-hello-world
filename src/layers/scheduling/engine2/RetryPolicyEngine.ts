/**
 * Scheduling Engine2 — Timeout & Retry Budget
 *
 * JobExecutor applies a per-execution RetryPolicy with exponential
 * backoff. What's missing is the long-horizon budget: unlimited retries
 * across many failures can spin a job forever, and timeouts need a
 * deadline budget so retries don't blow a window.
 *
 * Two cooperating policies:
 *
 *   `RetryBudget` — a per-job retry TOKEN BUCKET: `capacity` tokens refill
 *   at `refillPerMs`. Each retry consumes a token; success refunds one.
 *   An empty bucket dead-letters the job — bounded retry storms with
 *   automatic recovery once successes flow again.
 *
 *   `DeadlinePolicy` — computes per-attempt deadlines:
 *     - `perAttemptMs` caps each try;
 *     - `windowMs` caps total time across retries from first failure;
 *     - attempt n's effective timeout = min(perAttemptMs, window − elapsed);
 *     - when the window can't fit another attempt + its backoff delay,
 *     `canRetry` reports false with reason 'window-exhausted'.
 *
 * Backoff stays delegated to the job's RetryPolicy — this module only
 * enforces ceilings and tracks state.
 *
 * Complexity: O(1) per decision; state is one record per job.
 *
 * @module SchedulingLayer/Engine2
 */

import { Clock, RetryPolicy, SystemClock } from '../scheduler/SchedulerTypes';

export type RetryDeny = 'budget-exhausted' | 'window-exhausted' | 'attempts-exhausted';

export interface RetryDecision {
  readonly allowed: boolean;
  /** Why a retry was refused (undefined when allowed). */
  readonly denyReason?: RetryDeny;
  /** Delay before the next attempt per the RetryPolicy (0 when denied). */
  readonly delayMs: number;
  /** Attempt number this decision concerns (1-based). */
  readonly nextAttempt: number;
}

interface JobBudget {
  tokens: number;
  lastRefillAt: number;
  windowStartedAt: number | null;
}

export class RetryBudget {
  private readonly _clock: Clock;
  private readonly _capacity: number;
  private readonly _refillPerMs: number;
  private readonly _jobs = new Map<string, JobBudget>();

  constructor(capacity: number, refillPerMs: number, clock?: Clock) {
    if (capacity <= 0) throw new Error('capacity must be > 0');
    this._clock = clock ?? new SystemClock();
    this._capacity = capacity;
    this._refillPerMs = refillPerMs;
  }

  private _budget(jobId: string): JobBudget {
    let b = this._jobs.get(jobId);
    if (!b) {
      b = { tokens: this._capacity, lastRefillAt: this._clock.now(), windowStartedAt: null };
      this._jobs.set(jobId, b);
    }
    return b;
  }

  /** Lazy token-bucket refill — tokens accrue to capacity. */
  private _refill(b: JobBudget): void {
    const now = this._clock.now();
    const accrued = Math.floor((now - b.lastRefillAt) * this._refillPerMs);
    if (accrued > 0) {
      b.tokens = Math.min(this._capacity, b.tokens + accrued);
      b.lastRefillAt = now;
    }
  }

  /**
   * Decide whether attempt `attempts+1` may run. Consumes a token when
   * allowed. `policy` supplies the backoff curve and attempt ceiling.
   */
  decide(jobId: string, policy: RetryPolicy, attemptsSoFar: number): RetryDecision {
    const b = this._budget(jobId);
    this._refill(b);
    const nextAttempt = attemptsSoFar + 1;

    if (nextAttempt > policy.maxAttempts) {
      return { allowed: false, denyReason: 'attempts-exhausted', delayMs: 0, nextAttempt };
    }
    if (b.tokens < 1) {
      return { allowed: false, denyReason: 'budget-exhausted', delayMs: 0, nextAttempt };
    }
    b.tokens -= 1;
    return {
      allowed: true,
      delayMs: backoffDelay(policy, attemptsSoFar),
      nextAttempt,
    };
  }

  /** A successful execution refunds one token (bounded by capacity). */
  onSuccess(jobId: string): void {
    const b = this._budget(jobId);
    b.tokens = Math.min(this._capacity, b.tokens + 1);
    b.windowStartedAt = null;
  }

  tokens(jobId: string): number {
    const b = this._budget(jobId);
    this._refill(b);
    return b.tokens;
  }

  /** Mark the start of a retry window (first failure). */
  startWindow(jobId: string): void {
    const b = this._budget(jobId);
    if (b.windowStartedAt === null) b.windowStartedAt = this._clock.now();
  }

  windowStartedAt(jobId: string): number | null {
    return this._jobs.get(jobId)?.windowStartedAt ?? null;
  }
}

/** Exponential backoff for the NEXT attempt after `attemptsSoFar` tries. */
export function backoffDelay(policy: RetryPolicy, attemptsSoFar: number): number {
  if (policy.maxAttempts <= 1) return 0;
  const exp = Math.min(attemptsSoFar - 1, 30); // avoid 2^n blow-up
  return Math.min(policy.maxMs, policy.baseMs * Math.pow(policy.factor, exp));
}

/**
 * Windowed deadline: total retry budget across a job's failing streak.
 * Window opens on the first failure (RetryBudget.startWindow); it closes
 * when `windowMs` elapses — retries past that point are denied even if
 * tokens remain (the job has been failing too long; escalate instead).
 */
export class DeadlinePolicy {
  constructor(
    readonly perAttemptMs: number,
    readonly windowMs: number
  ) {
    if (perAttemptMs <= 0 || windowMs <= 0) throw new Error('deadlines must be > 0');
  }

  /** Effective timeout for an attempt starting at `now`. */
  attemptTimeout(now: number, windowStartedAt: number): number {
    const remaining = windowStartedAt + this.windowMs - now;
    return Math.max(0, Math.min(this.perAttemptMs, remaining));
  }

  /**
   * Can another attempt fit in the window? Needs time for the backoff
   * delay AND at least some execution time (> 0).
   */
  fits(now: number, windowStartedAt: number, delayMs: number): boolean {
    const start = now + delayMs;
    return windowStartedAt + this.windowMs - start > 0;
  }
}
