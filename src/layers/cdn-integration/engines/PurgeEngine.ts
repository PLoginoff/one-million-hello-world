/**
 * PurgeEngine — CDN invalidation with dedup and rate limiting.
 *
 * The purge pipeline:
 *   1. normalize the request (URL purges go through CacheKeyGenerator;
 *      wildcard/prefix are canonicalized to their path form)
 *   2. dedup — an identical (kind, normalized-value) purge already
 *      submitted within `dedupWindowMs` returns 'duplicate' with the
 *      original purge id
 *   3. rate-limit — a per-kind TokenBucket paces requests; exhausted
 *      buckets return 'rate_limited' with a retry hint
 *   4. accept — a synthetic purge id is issued and the request lands
 *      in `submitted` (the seam where a real provider API would be
 *      called)
 *
 * Wildcard matching compiles `*` to `[^/]*` and `**` to `.*` so
 * `/img/*.png` matches `/img/logo.png` but not `/img/a/b.png`, while
 * `/img/**` matches everything under `/img/`.
 *
 * @module CdnIntegration/Engines
 */

import { CacheKeyGenerator } from './CacheKey';
import { TokenBucket } from './RateLimiter';
import {
  IClock,
  PurgeKind,
  PurgeRequest,
  PurgeResult,
  RateLimitPolicy,
  SystemClock,
} from './types';

export interface PurgeEngineOptions {
  /** ms window in which an identical purge is a duplicate. Default 30s. */
  dedupWindowMs?: number;
  /** Per-kind rate limit overrides. */
  rateLimits?: Partial<Record<PurgeKind, RateLimitPolicy>>;
  /** Default rate limit for kinds without an override. */
  defaultRateLimit?: RateLimitPolicy;
  clock?: IClock;
}

interface SubmittedPurge {
  request: PurgeRequest;
  normalizedValue: string;
  purgeId: string;
  submittedAt: number;
}

const DEFAULT_LIMIT: RateLimitPolicy = { refillRatePerSec: 5, burst: 20 };

export class PurgeEngine {
  private readonly _clock: IClock;
  private readonly _dedupMs: number;
  private readonly _keyGen = new CacheKeyGenerator();
  private readonly _buckets = new Map<PurgeKind, TokenBucket>();
  private readonly _defaultLimit: RateLimitPolicy;
  private readonly _rateLimits: Partial<Record<PurgeKind, RateLimitPolicy>>;
  private readonly _submitted: SubmittedPurge[] = [];
  private _counter = 0;

  constructor(options: PurgeEngineOptions = {}) {
    this._clock = options.clock ?? new SystemClock();
    this._dedupMs = options.dedupWindowMs ?? 30_000;
    this._defaultLimit = options.defaultRateLimit ?? DEFAULT_LIMIT;
    this._rateLimits = options.rateLimits ?? {};
  }

  /** Every accepted purge, in submission order. */
  submitted(): readonly SubmittedPurge[] {
    return this._submitted;
  }

  /**
   * Submit a single purge. Returns the verdict without throwing on
   * invalid input — malformed requests come back `status:'invalid'`.
   */
  purge(request: PurgeRequest): PurgeResult {
    const normalized = this._normalize(request);
    if (normalized === null) {
      return { request, purgeId: '', status: 'invalid', message: 'malformed purge value' };
    }

    // Dedup within the window.
    const dup = this._submitted.find(
      (s) =>
        s.request.kind === request.kind &&
        s.normalizedValue === normalized &&
        this._clock.now() - s.submittedAt < this._dedupMs
    );
    if (dup !== undefined) {
      return {
        request,
        purgeId: dup.purgeId,
        status: 'duplicate',
        message: 'identical purge already submitted',
      };
    }

    // Rate limit.
    const bucket = this._bucketFor(request.kind);
    const cost = request.kind === PurgeKind.All ? 10 : 1;
    const acquire = bucket.tryAcquire(cost);
    if (!acquire.ok) {
      return {
        request,
        purgeId: '',
        status: 'rate_limited',
        message: `rate limited; retry after ${acquire.retryAfterMs}ms`,
        etaMs: acquire.retryAfterMs,
      };
    }

    const purgeId = `purge-${++this._counter}`;
    this._submitted.push({
      request,
      normalizedValue: normalized,
      purgeId,
      submittedAt: this._clock.now(),
    });
    return { request, purgeId, status: 'accepted', etaMs: 5_000 };
  }

  /** Submit many purges; returns one result per request, in order. */
  purgeAll(requests: readonly PurgeRequest[]): PurgeResult[] {
    return requests.map((r) => this.purge(r));
  }

  /**
   * Does a cache-key-matching URL match a submitted purge? Used by
   * tests and by the origin-shield simulator to decide what to drop.
   */
  matches(purge: PurgeRequest, url: string): boolean {
    const normalized = this._normalize(purge);
    if (normalized === null) return false;
    const key = this._keyGen.generate(url);
    switch (purge.kind) {
      case PurgeKind.Url:
        return key.key === normalized || key.path === normalized;
      case PurgeKind.Prefix:
        return key.path.startsWith(normalized);
      case PurgeKind.Wildcard:
        return wildcardToRegex(normalized).test(key.path);
      case PurgeKind.Tag:
        // Tags don't match URLs — they'd be resolved server-side via
        // surrogate-key index. Always false here.
        return false;
      case PurgeKind.All:
        return true;
    }
  }

  /**
   * Normalize a purge value to its canonical comparison form.
   * Returns null for malformed input.
   */
  private _normalize(request: PurgeRequest): string | null {
    const v = request.value.trim();
    switch (request.kind) {
      case PurgeKind.Url: {
        try {
          return this._keyGen.key(v);
        } catch {
          return null;
        }
      }
      case PurgeKind.Prefix:
      case PurgeKind.Wildcard: {
        const p = v.startsWith('/') ? v : `/${v}`;
        return p.length > 0 ? p : null;
      }
      case PurgeKind.Tag: {
        return v.length > 0 ? v.toLowerCase() : null;
      }
      case PurgeKind.All:
        return '*';
    }
  }

  private _bucketFor(kind: PurgeKind): TokenBucket {
    let b = this._buckets.get(kind);
    if (b === undefined) {
      b = new TokenBucket(this._rateLimits[kind] ?? this._defaultLimit, this._clock);
      this._buckets.set(kind, b);
    }
    return b;
  }
}

/** Compile a glob (`*` / `**`) into a RegExp. */
export function wildcardToRegex(pattern: string): RegExp {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/]*';
      }
      continue;
    }
    out += escapeRe(ch ?? '');
  }
  return new RegExp(out + '$');
}

function escapeRe(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}
