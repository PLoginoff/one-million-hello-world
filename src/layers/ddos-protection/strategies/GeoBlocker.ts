/**
 * GeoBlocker
 *
 * Stub for geo-IP blocking. Uses a static CIDR table keyed by ISO country
 * code — in production this would query a MaxMind DB; here it's an explicit
 * mapping for tests and a clean extension point.
 *
 * Matching:
 *  - Exact /32 IPs first (O(1) Set lookup)
 *  - Then CIDR prefixes in increasing-length order (longest-prefix-match
 *    is approximated; for the common case of non-overlapping blocks this is
 *    equivalent to a trie walk)
 *
 * Verdicts:
 *  - 'block' for explicitly blocked countries
 *  - 'allow' for everything else
 *  - 'challenge' for a configurable "gray list" (e.g. high-risk regions)
 *
 * @module DdosProtectionLayer/Strategies
 */

import { DetectionResult, IDetector, TrafficEvent, allow, verdict } from '../types/traffic';

/** IPv4 → 32-bit integer, or null for malformed input. */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }
  let out = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      return null;
    }
    out = (out << 8) + n;
  }
  return out >>> 0;
}

interface Cidr {
  network: number;
  mask: number;
  country: string;
}

export class GeoBlocker implements IDetector {
  readonly name = 'geo-blocker';

  private readonly _cidrs: Cidr[];
  private readonly _blockedCountries: Set<string>;
  private readonly _challengeCountries: Set<string>;
  private readonly _exactIpCountry: Map<string, string>;

  constructor() {
    this._cidrs = [];
    this._blockedCountries = new Set();
    this._challengeCountries = new Set();
    this._exactIpCountry = new Map();
  }

  /** Add a CIDR block for a country: `203.0.113.0/24` → 'CN'. */
  addCidr(cidr: string, country: string): void {
    const [ip, prefix] = cidr.split('/');
    const n = ipv4ToInt(ip);
    const bits = prefix ? Number(prefix) : 32;
    if (n === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
      return;
    }
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    this._cidrs.push({ network: n & mask, mask, country: country.toUpperCase() });
  }

  /** Map a single IP to a country (override). */
  addExact(ip: string, country: string): void {
    this._exactIpCountry.set(ip, country.toUpperCase());
  }

  blockCountry(code: string): void {
    this._blockedCountries.add(code.toUpperCase());
  }

  unblockCountry(code: string): void {
    this._blockedCountries.delete(code.toUpperCase());
  }

  challengeCountry(code: string): void {
    this._challengeCountries.add(code.toUpperCase());
  }

  /** Look up a country code for an IP, or null if unknown. */
  countryFor(ip: string): string | null {
    const exact = this._exactIpCountry.get(ip);
    if (exact) {
      return exact;
    }
    const n = ipv4ToInt(ip);
    if (n === null) {
      return null;
    }
    // Longest-prefix match: sort by mask descending.
    let best: Cidr | undefined;
    for (const c of this._cidrs) {
      if ((n & c.mask) === c.network) {
        if (!best || c.mask > best.mask) {
          best = c;
        }
      }
    }
    return best ? best.country : null;
  }

  inspect(event: TrafficEvent): DetectionResult {
    const country = this.countryFor(event.srcIp);
    if (country === null) {
      return allow(['no-geo-data']);
    }
    if (this._blockedCountries.has(country)) {
      return verdict('block', 1, [`geo-block:${country}`]);
    }
    if (this._challengeCountries.has(country)) {
      return verdict('challenge', 0.4, [`geo-challenge:${country}`]);
    }
    return allow([`geo:${country}`]);
  }
}
