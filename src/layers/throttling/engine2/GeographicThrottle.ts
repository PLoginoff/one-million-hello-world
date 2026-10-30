/**
 * GeographicThrottle — per-region rate limits.
 *
 * Some limits shouldn't be global: a region under attack (or under
 * regulatory constraint, or just disproportionately heavy) gets its own
 * allowance without touching the rest of the world's throughput.
 *
 * Model: fixed-window counters keyed by (region, subject-key). Each
 * region has its own `limit` per `windowMs`; unknown/unmapped regions
 * fall back to `defaultLimit`. Regions are matched via an ordered rule
 * list — first match wins — so you can express "us-east strict, rest
 * default" or carve out individual countries inside a continent.
 *
 * Fixed window is deliberate over sliding log: O(1) memory per key,
 * O(1) per evaluate. Boundary-burst behavior (2× limit at window edges)
 * is the standard fixed-window caveat; callers needing tighter fairness
 * compose this with a token bucket in a ThrottleChain.
 *
 * @module ThrottlingLayer/Engine2
 */

import { ThrottleClock2, SystemThrottleClock2, ThrottleVerdict } from './types';

export interface RegionRule {
  /** Region identifier this rule matches (exact, case-insensitive), or
   *  a prefix ending in "*" e.g. "eu-*". */
  readonly match: string;
  /** Human-readable name used in verdicts/analytics. */
  readonly name: string;
  /** Allowed requests per window for matched keys. */
  readonly limit: number;
}

export interface GeoRequest {
  /** The caller's region code, e.g. "us-east-1", "eu-west", "in". */
  readonly region?: string;
  /** Subject key for counting (api key, user id, ip). */
  readonly key: string;
}

export interface GeographicThrottleOptions {
  /** Ordered rules — first match wins. */
  rules: RegionRule[];
  /** Fallback limit for unmatched/absent regions. */
  defaultLimit: number;
  /** Window length in ms. */
  windowMs: number;
  clock?: ThrottleClock2;
}

interface Counter {
  count: number;
  windowStart: number;
}

export class GeographicThrottle {
  private readonly _rules: RegionRule[];
  private readonly _defaultLimit: number;
  private readonly _windowMs: number;
  private readonly _clock: ThrottleClock2;
  private readonly _counters = new Map<string, Counter>();

  constructor(opts: GeographicThrottleOptions) {
    if (!opts.rules.length) throw new Error('at least one rule required');
    this._rules = [...opts.rules].sort((a, b) => b.match.length - a.match.length); // longest match first
    this._defaultLimit = opts.defaultLimit;
    this._windowMs = opts.windowMs;
    this._clock = opts.clock ?? new SystemThrottleClock2();
  }

  private _ruleFor(region?: string): { rule: RegionRule | null; limit: number; name: string } {
    const r = (region ?? '').toLowerCase();
    for (const rule of this._rules) {
      const m = rule.match.toLowerCase();
      if (m.endsWith('*') ? r.startsWith(m.slice(0, -1)) : r === m) {
        return { rule, limit: rule.limit, name: rule.name };
      }
    }
    return { rule: null, limit: this._defaultLimit, name: 'default' };
  }

  /**
   * Evaluate one request. Counter key = `${ruleName}:${key}` so the same
   * caller straddling two regions gets an independent budget in each —
   * deliberate: a botnet can't evade the us cap by spraying eu traffic.
   */
  evaluate(req: GeoRequest): ThrottleVerdict {
    const { limit, name } = this._ruleFor(req.region);
    const now = this._clock.now();
    const winStart = Math.floor(now / this._windowMs) * this._windowMs;
    const counterKey = `${name}:${req.key}`;
    let c = this._counters.get(counterKey);
    if (!c || c.windowStart !== winStart) {
      c = { count: 0, windowStart: winStart };
      this._counters.set(counterKey, c);
    }
    if (c.count >= limit) {
      return {
        allowed: false,
        decidedBy: `region:${name}`,
        reason: `region limit ${limit}/${this._windowMs}ms exceeded`,
        retryAfterMs: winStart + this._windowMs - now,
        remaining: 0,
      };
    }
    c.count++;
    return { allowed: true, decidedBy: `region:${name}`, remaining: limit - c.count };
  }

  /** Current count for a region+key in the live window. */
  count(req: GeoRequest): number {
    const { name } = this._ruleFor(req.region);
    const winStart = Math.floor(this._clock.now() / this._windowMs) * this._windowMs;
    return this._counters.get(`${name}:${req.key}`)?.count ?? 0;
  }

  /** Rule that would apply to a region (analytics/debug). */
  ruleFor(region?: string): string {
    return this._ruleFor(region).name;
  }

  /** Live counter keys (one per region+key pair). */
  get counterCount(): number {
    return this._counters.size;
  }
}
