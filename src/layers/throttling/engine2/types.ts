/**
 * Throttling Engine2 — Shared Types
 *
 * Second-generation throttling primitives: geographic rate limits,
 * per-plan API tiers, burst credits that bank unused capacity, chained
 * throttle orchestration with early exit, and consumer analytics.
 *
 * @module ThrottlingLayer/Engine2
 */

/** Injectable clock for window resets and credit accrual. */
export interface ThrottleClock2 {
  now(): number;
}

export class SystemThrottleClock2 implements ThrottleClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualThrottleClock2 implements ThrottleClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/** The result of evaluating a request against a throttle. */
export interface ThrottleVerdict {
  /** Whether the request is allowed through. */
  readonly allowed: boolean;
  /** Which rule component decided (e.g. "region:us", "tier:free",
   *  "credit"). Useful for analytics and Retry-After hints. */
  readonly decidedBy: string;
  /** Why a rejection happened, when allowed = false. */
  readonly reason?: string;
  /** Tokens/credits remaining after this verdict, when meaningful. */
  readonly remaining?: number;
  /** Suggested retry delay in ms for rejections. */
  readonly retryAfterMs?: number;
}

/** A single link in an orchestrated throttle chain. */
export interface ThrottleRule {
  /** Rule identifier, used as `decidedBy` in verdicts. */
  readonly name: string;
  evaluate(key: string, cost?: number): ThrottleVerdict;
}
