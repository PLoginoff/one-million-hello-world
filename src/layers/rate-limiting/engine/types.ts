/**
 * Rate-Limiting Engine — shared types.
 *
 * Vocabulary:
 * - `SlidingWindowLog`   — exact sorted-set sliding window: every
 *                          request timestamp is kept; count =
 *                          entries inside [now-window, now].
 * - `QuotaBuckets`       — multi-dimensional per-key limits: one
 *                          request may consume ip+route+user quotas
 *                          simultaneously; the strictest wins.
 * - `PenaltyEscalator`   — repeat-violator windows: each violation
 *                          multiplies the next window's duration.
 * - `TokenBucket`        — refill-timestamp token bucket shaped for
 *                          distributed consistency (state =
 *                          {tokens, lastRefill} — serializable).
 * - `LimitHeaders`       — X-RateLimit-* + Retry-After computation.
 *
 * All state is plain data (Maps of records) — a store adapter could
 * serialize any of it; nothing here holds sockets or timers.
 *
 * @module RateLimitingLayer/Engine
 */

import { RateLimitError } from '../utils/RateLimitError';

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

export interface RateLimitClock {
  now(): number;
}

export class SystemRateLimitClock implements RateLimitClock {
  now(): number {
    return Date.now();
  }
}

export class ManualRateLimitClock implements RateLimitClock {
  private _t = 0;
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

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class QuotaExhaustedError extends RateLimitError {
  readonly dimension: string;
  readonly retryAfterMs: number;
  constructor(dimension: string, retryAfterMs: number) {
    super(
      'QUOTA_EXHAUSTED',
      `Quota exhausted on dimension '${dimension}', retry in ${retryAfterMs}ms`,
      429
    );
    this.name = 'QuotaExhaustedError';
    this.dimension = dimension;
    this.retryAfterMs = retryAfterMs;
  }
}

/* ------------------------------------------------------------------ */
/* Sliding window log                                                  */
/* ------------------------------------------------------------------ */

export interface SlidingWindowLogOptions {
  /** Window duration, ms. */
  readonly windowMs: number;
  /** Max entries retained per key (safety bound). 0 = unlimited. */
  readonly maxLogSize?: number;
  /** Injectable clock. */
  readonly clock?: RateLimitClock;
}

export interface WindowDecision {
  readonly allowed: boolean;
  /** Requests in the current window after this call. */
  readonly count: number;
  /** Requests remaining before the limit. */
  readonly remaining: number;
  /** Ms until the oldest in-window request expires (≈ Retry-After). */
  readonly retryAfterMs: number;
  /** Ms until the whole window clears (≈ X-RateLimit-Reset). */
  readonly resetInMs: number;
}

/* ------------------------------------------------------------------ */
/* Quota buckets                                                       */
/* ------------------------------------------------------------------ */

/** One dimension's limit: `capacity` per `windowMs`. */
export interface QuotaDimension {
  /** Dimension name for diagnostics ('ip', 'route', 'user', ...). */
  readonly name: string;
  /** Extract the dimension's key from a request context. */
  readonly keyOf: (ctx: QuotaContext) => string | null;
  readonly capacity: number;
  readonly windowMs: number;
}

/** Request context offered to the quota engine. */
export interface QuotaContext {
  readonly ip?: string;
  readonly route?: string;
  readonly userId?: string;
  readonly apiKey?: string;
  readonly tenantId?: string;
  readonly [extra: string]: string | undefined;
}

export interface QuotaResult {
  readonly allowed: boolean;
  /** The dimension that refused (when not allowed). */
  readonly deniedBy?: string;
  /** Per-dimension remaining counts. */
  readonly remaining: Readonly<Record<string, number>>;
  /** Longest reset across dimensions (effective retry). */
  readonly retryAfterMs: number;
}

/* ------------------------------------------------------------------ */
/* Penalty escalation                                                  */
/* ------------------------------------------------------------------ */

export interface PenaltyOptions {
  /** Base window applied at violation #1. */
  readonly baseWindowMs: number;
  /** Multiplier per subsequent violation (e.g. 2 = doubling). */
  readonly multiplier?: number;
  /** Ceiling on the escalated window. */
  readonly maxWindowMs?: number;
  /** Ms of clean behaviour that resets a violator's level. */
  readonly resetAfterMs?: number;
  /** Injectable clock. */
  readonly clock?: RateLimitClock;
}

export interface PenaltyState {
  /** Current escalation level (0 = clean). */
  readonly level: number;
  /** Window duration that applies at this level. */
  readonly effectiveWindowMs: number;
  /** Ms until the level decays to clean. */
  readonly decaysInMs: number;
}

/* ------------------------------------------------------------------ */
/* Token bucket (distributed-friendly)                                 */
/* ------------------------------------------------------------------ */

/**
 * Serializable bucket state — the distributed contract: two nodes
 * holding the same `{tokens, lastRefillMs}` and clock reach the same
 * decision without communication.
 */
export interface BucketState {
  /** Current token balance (float — partial refill allowed). */
  readonly tokens: number;
  /** Last refill timestamp, ms epoch. */
  readonly lastRefillMs: number;
}

export interface TokenBucketOptions {
  /** Burst capacity = max tokens. */
  readonly capacity: number;
  /** Tokens added per second. */
  readonly refillRatePerSec: number;
  /** Injectable clock. */
  readonly clock?: RateLimitClock;
}

export interface TokenBucketDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Ms until 1 token is available when denied; 0 when allowed. */
  readonly retryAfterMs: number;
  /** Updated state — persist this to share the bucket. */
  readonly state: BucketState;
}

/* ------------------------------------------------------------------ */
/* Limit headers                                                       */
/* ------------------------------------------------------------------ */

export interface RateLimitHeaders {
  /** X-RateLimit-Limit: the configured limit. */
  readonly 'X-RateLimit-Limit': string;
  /** X-RateLimit-Remaining: requests left in the window. */
  readonly 'X-RateLimit-Remaining': string;
  /** X-RateLimit-Reset: unix seconds when the window clears. */
  readonly 'X-RateLimit-Reset': string;
  /** Retry-After: present only when denied. */
  readonly 'Retry-After'?: string;
}

export interface LimitHeaderInput {
  readonly limit: number;
  readonly remaining: number;
  /** Unix *milliseconds* when the window resets. */
  readonly resetAtMs: number;
  /** When denied: ms until retry is safe. */
  readonly retryAfterMs?: number;
}
