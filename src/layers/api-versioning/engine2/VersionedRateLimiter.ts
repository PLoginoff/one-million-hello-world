/**
 * Versioned Rate Limiter
 *
 * Sliding-log rate limits scoped per (client, version) pair, so a
 * deprecated version can be throttled harder than the current one —
 * the standard lever for pushing stragglers off old versions.
 *
 * Algorithm: sliding-window log. Each key keeps a sorted array of call
 * timestamps; on each check we drop entries older than `windowMs`
 * (amortised O(1) per call — each timestamp is pushed once and popped
 * once). Memory is O(maxCalls) per active key.
 *
 * A client with no configured limit for a version falls back to the
 * wildcard `'*'` limit, then to unlimited.
 *
 * @module ApiVersioningLayer/Engine2
 */

import { IClock, RateLimitVerdict, SystemClock, VersionRateLimit } from './types';

export class VersionedRateLimiter {
  private readonly _limits: Map<string, VersionRateLimit>;
  /** `${clientId}${version}` -> sorted call timestamps. */
  private readonly _logs: Map<string, number[]>;
  private readonly _clock: IClock;
  private readonly _defaultLimit: VersionRateLimit | null;

  constructor(
    limits: readonly VersionRateLimit[],
    options: { clock?: IClock; defaultLimit?: VersionRateLimit } = {}
  ) {
    this._limits = new Map(limits.map((l) => [l.version, l]));
    this._logs = new Map();
    this._clock = options.clock ?? new SystemClock();
    this._defaultLimit = options.defaultLimit ?? null;
  }

  /**
   * Check and record a call. When the limit is exhausted the call is
   * NOT recorded — rejected calls don't count against the quota.
   */
  check(clientId: string, version: string): RateLimitVerdict {
    const limit = this._limits.get(version) ?? this._defaultLimit;
    if (!limit) {
      return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAt: null };
    }

    const now = this._clock.now();
    const key = `${clientId}${version}`;
    let log = this._logs.get(key);
    if (!log) {
      log = [];
      this._logs.set(key, log);
    }

    // Evict expired entries (window start = now - windowMs).
    const cutoff = now - limit.windowMs;
    let head = 0;
    while (head < log.length && log[head]! <= cutoff) head += 1;
    if (head > 0) log.splice(0, head);

    if (log.length >= limit.maxCalls) {
      // Oldest in-window call bounds the retry time.
      return { allowed: false, remaining: 0, retryAt: log[0]! + limit.windowMs };
    }

    log.push(now);
    return { allowed: true, remaining: limit.maxCalls - log.length, retryAt: null };
  }

  /** Remaining calls without recording — pure read. */
  remaining(clientId: string, version: string): number {
    const limit = this._limits.get(version) ?? this._defaultLimit;
    if (!limit) return Number.MAX_SAFE_INTEGER;
    const now = this._clock.now();
    const key = `${clientId}${version}`;
    const log = this._logs.get(key);
    if (!log) return limit.maxCalls;
    const cutoff = now - limit.windowMs;
    let live = 0;
    for (const t of log) if (t > cutoff) live += 1;
    return Math.max(0, limit.maxCalls - live);
  }

  /** Update or replace a version's limit at runtime. */
  setLimit(limit: VersionRateLimit): void {
    this._limits.set(limit.version, limit);
  }

  /** Forget all recorded calls (e.g. after a deploy). */
  reset(): void {
    this._logs.clear();
  }
}
