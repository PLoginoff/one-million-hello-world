/**
 * QuotaBuckets — multi-dimensional quota enforcement.
 *
 * A single request consumes several quotas at once — per-IP, per-
 * route, per-user — each with its own window and capacity. The
 * strictest dimension wins: if *any* dimension is exhausted the
 * request is denied, and `deniedBy` names it (crucial for clients —
 * "you're rate-limited because your IP is hot" vs "because this
 * route is hot" are very different responses).
 *
 * Implementation: each dimension delegates to a `SlidingWindowLog`
 * keyed by `${dimension}:${value}` — dimensions are orthogonal and
 * independent. The composite check runs all dimensions' `hit` in
 * declaration order and *rolls back* successful hits when a later
 * dimension denies — a denied request must not consume quota it
 * didn't get to use. That rollback is what makes this "multi-
 * dimensional" rather than just "run three limiters in sequence".
 *
 * A dimension whose `keyOf` returns null is skipped for the request
 * (e.g. a user-quota on an unauthenticated route — no key, no quota).
 *
 * Complexity: `check` is O(dimensions × log-trim); rollback is
 * O(dimensions that consumed).
 *
 * @module RateLimitingLayer/Engine
 */

import {
  QuotaContext,
  QuotaDimension,
  QuotaResult,
  RateLimitClock,
  SystemRateLimitClock,
} from './types';
import { SlidingWindowLog as Log } from './SlidingWindowLog';

export class QuotaBuckets {
  private readonly _dimensions: readonly QuotaDimension[];
  private readonly _logs: Map<string, Log>;
  private readonly _clock: RateLimitClock;

  constructor(dimensions: readonly QuotaDimension[], clock?: RateLimitClock) {
    if (dimensions.length === 0) {
      throw new RangeError('at least one quota dimension is required');
    }
    this._dimensions = dimensions;
    this._clock = clock ?? new SystemRateLimitClock();
    this._logs = new Map();
  }

  get dimensionNames(): readonly string[] {
    return this._dimensions.map((d) => d.name);
  }

  /**
   * Check + consume one request against every dimension. Atomic in
   * the sense that a denial leaves no dimension's state consumed —
   * earlier dimensions' hits are rolled back (their timestamp is
   * removed from the log).
   */
  check(ctx: QuotaContext): QuotaResult {
    const consumed: { log: Log; key: string; ts: number }[] = [];
    const remaining: Record<string, number> = {};
    let retryAfterMs = 0;

    for (const dim of this._dimensions) {
      const key = dim.keyOf(ctx);
      if (key === null || key === undefined || key === '') {
        continue; // dimension not applicable to this request
      }
      const logKey = `${dim.name}:${key}`;
      const log = this._logFor(logKey, dim.windowMs);
      const decision = log.hit(logKey, dim.capacity);

      remaining[dim.name] = decision.remaining;
      retryAfterMs = Math.max(retryAfterMs, decision.retryAfterMs);

      if (!decision.allowed) {
        // Roll back the dimensions that already consumed — a denied
        // request must not have eaten quota.
        for (const c of consumed) {
          c.log.unhit(c.key);
        }
        return {
          allowed: false,
          deniedBy: dim.name,
          remaining,
          retryAfterMs,
        };
      }

      consumed.push({ log, key: logKey, ts: this._clock.now() });
    }

    return { allowed: true, remaining, retryAfterMs: 0 };
  }

  /**
   * Peek: compute the result without consuming quota. Equivalent to
   * `check` but replays timestamps off — used for header emission on
   * denied responses (don't double-charge the denial).
   */
  peek(ctx: QuotaContext): QuotaResult {
    const remaining: Record<string, number> = {};
    let retryAfterMs = 0;
    let deniedBy: string | undefined;

    for (const dim of this._dimensions) {
      const key = dim.keyOf(ctx);
      if (key === null || key === undefined || key === '') {
        continue;
      }
      const logKey = `${dim.name}:${key}`;
      const log = this._logs.get(logKey);
      const count = log ? log.count(logKey) : 0;
      remaining[dim.name] = Math.max(0, dim.capacity - count);
      if (count >= dim.capacity) {
        deniedBy = dim.name;
        retryAfterMs = Math.max(retryAfterMs, dim.windowMs); // conservative
      }
    }
    return { allowed: deniedBy === undefined, deniedBy, remaining, retryAfterMs };
  }

  /** Reset a specific dimension's counter for a key. */
  resetDimension(dimension: string, key: string): void {
    this._logs.delete(`${dimension}:${key}`);
  }

  /** Drop empty logs — O(keys) sweep. */
  sweep(): number {
    let n = 0;
    for (const [k, log] of this._logs) {
      log.sweep();
      if (log.trackedKeys === 0) {
        this._logs.delete(k);
        n++;
      }
    }
    return n;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _logFor(logKey: string, windowMs: number): Log {
    let log = this._logs.get(logKey);
    if (!log) {
      log = new Log({ windowMs, clock: this._clock });
      this._logs.set(logKey, log);
    }
    return log;
  }

}
