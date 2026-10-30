/**
 * OriginShield — regional request-collapse routing.
 *
 * Origin shielding concentrates cache misses through a single "shield"
 * PoP per region so the origin sees one request instead of one per
 * edge PoP. This engine decides:
 *
 *   1. which shield PoP should serve an edge PoP (nearest shield in
 *      the same region, else the global default)
 *   2. whether a miss should collapse — concurrent identical
 *      in-flight misses to the same shield join one origin fetch
 *      (request collapsing / coalescing)
 *
 * `collapse(key, fetch)` implements the coalescing: first caller for a
 * key performs `fetch()`; subsequent callers with the same key get the
 * same promise. The map entry is removed on settle — in-flight only.
 *
 * @module CdnIntegration/Engines
 */

/** A shield PoP location. */
export interface ShieldPop {
  /** PoP id, e.g. 'iad-shield-1'. */
  id: string;
  /** ISO-ish region code, e.g. 'us-east', 'eu-west'. */
  region: string;
  /** Relative latency weight (lower = preferred within region). */
  latencyHint?: number;
}

export interface ShieldDecision {
  shield: string;
  /** 'regional' when a same-region shield was found, else 'global_fallback'. */
  via: 'regional' | 'global_fallback';
}

export class OriginShield {
  private readonly _shields: ShieldPop[];
  private readonly _defaultShield: string | undefined;
  /** In-flight coalesce table: cache key → shared promise. */
  private readonly _inflight = new Map<string, Promise<unknown>>();

  /**
   * `defaultShieldId` is used when no same-region shield exists —
   * typically the shield closest to the origin.
   */
  constructor(shields: ShieldPop[], defaultShieldId?: string) {
    this._shields = [...shields];
    this._defaultShield = defaultShieldId ?? shields[0]?.id;
  }

  /**
   * Pick the shield for an edge PoP's region: lowest-latency shield in
   * the same region, else the configured default.
   */
  route(edgeRegion: string): ShieldDecision {
    let best: ShieldPop | undefined;
    for (const s of this._shields) {
      if (s.region !== edgeRegion) continue;
      if (best === undefined || (s.latencyHint ?? 0) < (best.latencyHint ?? 0)) {
        best = s;
      }
    }
    if (best !== undefined) return { shield: best.id, via: 'regional' };
    return { shield: this._defaultShield ?? 'none', via: 'global_fallback' };
  }

  /**
   * Collapse concurrent fetches for `key` into one. The first call
   * runs `fetch`; calls while it's in-flight share the result.
   */
  async collapse<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const existing = this._inflight.get(key);
    if (existing !== undefined) {
      return existing as Promise<T>;
    }
    const p = fetch().finally(() => {
      this._inflight.delete(key);
    });
    this._inflight.set(key, p as Promise<unknown>);
    return p;
  }

  /** Number of keys currently in-flight (exposed for tests). */
  inflightCount(): number {
    return this._inflight.size;
  }
}
