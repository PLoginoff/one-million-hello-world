/**
 * TierThrottle — per-plan rate limits with graceful degradation.
 *
 * Different API plans get different ceilings: free keys at 60/min, pro
 * at 600, enterprise at 6000. A key's tier is resolved via an injectable
 * lookup (your billing service); lookups are cached for `tierCacheMs`
 * because plan changes are rare and the lookup is on the hot path.
 *
 * Limits are fixed-window counters keyed by subject — same O(1)
 * guarantees as GeographicThrottle. A key with no resolvable tier falls
 * back to `defaultTier` (fail-closed): unknown customers get the lowest
 * limit rather than a free pass.
 *
 * Tier changes take effect on the next window or when the cached entry
 * expires — whichever comes first; `refresh` forces re-resolution.
 *
 * @module ThrottlingLayer/Engine2
 */

import { ThrottleClock2, SystemThrottleClock2, ThrottleVerdict } from './types';

export interface TierSpec {
  readonly name: string;
  /** Allowed requests per window for keys on this tier. */
  readonly limit: number;
}

export interface TierThrottleOptions {
  /** Tier registry, ordered (preference only affects reporting). */
  tiers: TierSpec[];
  /** Tier name applied when lookup returns null/unknown. */
  defaultTier: string;
  /** Window length in ms. */
  windowMs: number;
  /** How long to cache a key's resolved tier (ms). Default 60_000. */
  tierCacheMs?: number;
  /** Resolves a subject key to a tier name (billing/plan lookup). */
  lookupTier: (key: string) => string | null;
  clock?: ThrottleClock2;
}

interface Counter {
  count: number;
  windowStart: number;
}

interface TierEntry {
  tier: string;
  resolvedAtMs: number;
}

export class TierThrottle {
  private readonly _limits = new Map<string, number>();
  private readonly _defaultTier: string;
  private readonly _windowMs: number;
  private readonly _tierCacheMs: number;
  private readonly _lookup: (key: string) => string | null;
  private readonly _clock: ThrottleClock2;
  private readonly _counters = new Map<string, Counter>();
  private readonly _tiers = new Map<string, TierEntry>();

  constructor(opts: TierThrottleOptions) {
    for (const t of opts.tiers) this._limits.set(t.name, t.limit);
    if (!this._limits.has(opts.defaultTier)) {
      throw new Error(`defaultTier "${opts.defaultTier}" not in tiers`);
    }
    this._defaultTier = opts.defaultTier;
    this._windowMs = opts.windowMs;
    this._tierCacheMs = opts.tierCacheMs ?? 60_000;
    this._lookup = opts.lookupTier;
    this._clock = opts.clock ?? new SystemThrottleClock2();
  }

  /** Resolve a key's tier with caching — stale entries re-resolve. */
  private _tier(key: string): string {
    const now = this._clock.now();
    const e = this._tiers.get(key);
    if (e && now - e.resolvedAtMs < this._tierCacheMs) return e.tier;
    const resolved = this._lookup(key);
    const tier = resolved && this._limits.has(resolved) ? resolved : this._defaultTier;
    this._tiers.set(key, { tier, resolvedAtMs: now });
    return tier;
  }

  /** Force a key's tier to be re-resolved on next evaluate. */
  refresh(key: string): void {
    this._tiers.delete(key);
  }

  evaluate(key: string): ThrottleVerdict {
    const tier = this._tier(key);
    const limit = this._limits.get(tier) ?? 0;
    const now = this._clock.now();
    const winStart = Math.floor(now / this._windowMs) * this._windowMs;
    let c = this._counters.get(key);
    if (!c || c.windowStart !== winStart) {
      c = { count: 0, windowStart: winStart };
      this._counters.set(key, c);
    }
    if (c.count >= limit) {
      return {
        allowed: false,
        decidedBy: `tier:${tier}`,
        reason: `${tier} tier limit ${limit}/${this._windowMs}ms exceeded`,
        retryAfterMs: winStart + this._windowMs - now,
        remaining: 0,
      };
    }
    c.count++;
    return { allowed: true, decidedBy: `tier:${tier}`, remaining: limit - c.count };
  }

  /** Which tier a key currently resolves to (cached). */
  tierOf(key: string): string {
    return this._tier(key);
  }

  /** Count for a key in the live window. */
  count(key: string): number {
    const winStart = Math.floor(this._clock.now() / this._windowMs) * this._windowMs;
    return this._counters.get(key)?.count ?? 0;
  }
}
