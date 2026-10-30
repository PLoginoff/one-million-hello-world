/**
 * CdnRouter — weighted multi-CDN provider selection.
 *
 * A stub-but-real traffic router: picks a provider per request using
 * weighted selection restricted to healthy providers that serve the
 * request's region. Two policies:
 *
 *   - `weighted`      — probability ∝ weight among eligible providers
 *                      (random source injectable for tests)
 *   - `sticky`        — consistent-hash the request key onto the
 *                      eligible providers' weight distribution so the
 *                      same URL always routes to the same provider
 *                      (cache affinity: keeps the object on one CDN)
 *
 * Health and hit-ratio feed eligibility: unhealthy providers are
 * excluded entirely; when `preferHitRatio` is on, each provider's
 * effective weight is `weight * (1 + hitRatio)`.
 *
 * @module CdnIntegration/Engines
 */

import { CdnProvider, RoutingDecision } from './types';

export interface RouterOptions {
  /** Random source for weighted mode (injectable for tests). */
  rand?: () => number;
  /** Fold hitRatio into the weight as `w * (1 + hitRatio)`. */
  preferHitRatio?: boolean;
}

export class CdnRouter {
  private _providers: CdnProvider[];
  private readonly _rand: () => number;
  private readonly _preferHit: boolean;

  constructor(providers: CdnProvider[] = [], options: RouterOptions = {}) {
    this._providers = [...providers];
    this._rand = options.rand ?? Math.random;
    this._preferHit = options.preferHitRatio ?? false;
  }

  setProviders(providers: CdnProvider[]): void {
    this._providers = [...providers];
  }

  /**
   * Weighted-random route. `region` filters to providers declaring the
   * region (or global providers with an empty regions list).
   */
  route(region: string): RoutingDecision | null {
    const eligible = this._eligible(region);
    if (eligible.length === 0) return null;
    const weights = eligible.map((p) => this._effectiveWeight(p));
    const total = weights.reduce((a, w) => a + w, 0);
    if (total <= 0) {
      // All weights zero: uniform fallback.
      const pick = eligible[Math.floor(this._rand() * eligible.length)];
      return { provider: pick?.name ?? eligible[0]?.name ?? '', reason: 'uniform (zero weights)' };
    }
    let roll = this._rand() * total;
    for (let i = 0; i < eligible.length; i++) {
      roll -= weights[i] ?? 0;
      if (roll <= 0) {
        return { provider: eligible[i]?.name ?? '', reason: `weighted (w=${weights[i]})` };
      }
    }
    const last = eligible[eligible.length - 1];
    return { provider: last?.name ?? '', reason: 'weighted (tail)' };
  }

  /**
   * Consistent-hash route: `key` hashes onto the weight distribution,
   * so the same object always lands on the same provider — the cache-
   * affinity property weighted-random lacks.
   */
  routeSticky(key: string, region: string): RoutingDecision | null {
    const eligible = this._eligible(region);
    if (eligible.length === 0) return null;
    const weights = eligible.map((p) => this._effectiveWeight(p));
    const total = weights.reduce((a, w) => a + w, 0);
    if (total <= 0) return this.route(region);
    // FNV-1a hash → [0,1) position on the weight line.
    const h = fnv1a(key);
    const pos = (h >>> 0) / 0xffffffff;
    let acc = 0;
    for (let i = 0; i < eligible.length; i++) {
      acc += (weights[i] ?? 0) / total;
      if (pos < acc) {
        return { provider: eligible[i]?.name ?? '', reason: `sticky (h=${(h >>> 0).toString(16)})` };
      }
    }
    const last = eligible[eligible.length - 1];
    return { provider: last?.name ?? '', reason: 'sticky (tail)' };
  }

  private _eligible(region: string): CdnProvider[] {
    return this._providers.filter(
      (p) => p.healthy && (p.regions.length === 0 || p.regions.includes(region))
    );
  }

  private _effectiveWeight(p: CdnProvider): number {
    const w = Math.max(0, p.weight);
    return this._preferHit ? w * (1 + (p.hitRatio ?? 0)) : w;
  }
}

/** 32-bit FNV-1a hash of a string. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}
