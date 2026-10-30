/**
 * GeoBlock — country-based allow/deny lists.
 *
 * Two modes:
 *  - blocklist: requests from listed countries are blocked; everything
 *    else passes.
 *  - allowlist: only requests from listed countries pass; everything
 *    else is blocked (highest-security posture).
 *
 * Country resolution is pluggable — upstream middleware (e.g. a
 * Cloudflare/MaxMind header) usually stamps `request.country`; a
 * `countryResolver` hook can fill it from the client IP. Unknown country
 * codes are treated as `undeclaredBehavior` — 'allow' (fail-open) or
 * 'block' (fail-closed).
 *
 * Lookup is a Set membership test — O(1).
 *
 * @module WafLayer/Engine2
 */

import { WafRequest2, WafVerdict2 } from './types';

export interface GeoBlockOptions {
  /** ISO-3166 alpha-2 codes, e.g. ['CN', 'KP']. Case-insensitive. */
  countries: readonly string[];
  mode: 'blocklist' | 'allowlist';
  /** What to do when no country can be determined. Default 'allow'. */
  undeclaredBehavior?: 'allow' | 'block';
  /** Optional IP→country resolver for requests lacking `country`. */
  countryResolver?: (ip: string) => string | undefined;
  /** Rule id stamped on verdicts. Default 'geo-block'. */
  ruleId?: string;
}

export class GeoBlock {
  private readonly _countries: Set<string>;
  private readonly _mode: 'blocklist' | 'allowlist';
  private readonly _undeclared: 'allow' | 'block';
  private readonly _resolver: ((ip: string) => string | undefined) | undefined;
  private readonly _ruleId: string;

  constructor(opts: GeoBlockOptions) {
    this._countries = new Set(opts.countries.map((c) => c.toUpperCase()));
    this._mode = opts.mode;
    this._undeclared = opts.undeclaredBehavior ?? 'allow';
    this._resolver = opts.countryResolver;
    this._ruleId = opts.ruleId ?? 'geo-block';
  }

  /** Evaluate a request. Returns a block verdict or null (pass). */
  evaluate(req: WafRequest2): WafVerdict2 | null {
    const cc = (req.country ?? this._resolver?.(req.clientIp))?.toUpperCase();

    if (cc === undefined) {
      return this._undeclared === 'block'
        ? { action: 'block', ruleId: this._ruleId, reason: 'country undetermined', score: 0.5 }
        : null;
    }

    const listed = this._countries.has(cc);
    const blocked = this._mode === 'blocklist' ? listed : !listed;
    if (!blocked) return null;

    return {
      action: 'block',
      ruleId: this._ruleId,
      reason:
        this._mode === 'blocklist'
          ? `country ${cc} is blocklisted`
          : `country ${cc} not in allowlist`,
      score: 0.9,
    };
  }

  /** Membership test — handy for admin tooling. */
  isListed(country: string): boolean {
    return this._countries.has(country.toUpperCase());
  }

  addCountry(code: string): void {
    this._countries.add(code.toUpperCase());
  }

  removeCountry(code: string): boolean {
    return this._countries.delete(code.toUpperCase());
  }

  get countryCount(): number {
    return this._countries.size;
  }
}
