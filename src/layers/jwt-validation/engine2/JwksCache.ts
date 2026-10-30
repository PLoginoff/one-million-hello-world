/**
 * JwksCache — JWKS caching with kid-triggered forced refresh.
 *
 * Wraps a `JwksFetcher` (stub-able — no HTTP here) with:
 *
 *  - TTL cache: the whole keyset is cached for `cacheTtlMs`; reads inside
 *    the window never hit the network.
 *  - Unknown-kid refresh: a lookup for a `kid` not in the cached set
 *    triggers ONE forced refresh (per `refreshCooldownMs`) — the classic
 *    key-rotation race where a new token arrives before the TTL expires.
 *    Repeat unknown kids inside the cooldown don't refetch (DoS guard).
 *  - Single-flight: concurrent refreshes share one promise.
 *  - Stale-on-error: a failed refresh keeps serving the previous set.
 *
 * Key matching: `resolve(kid, alg)` prefers an exact `kid` match, then
 * falls back to keys whose `alg`/`kty` are compatible (same rules as
 * JwkStore.resolve, but over the cached set).
 *
 * Complexity: lookup O(K) over the cached keyset (K small — typically
 * < 10 keys); refresh O(1) amortized by TTL.
 *
 * @module JwtValidationLayer/Engine2
 */

import { JsonWebKeyObject, JwkSet } from '../jwt/types';
import { JwtClock2, SystemJwtClock2 } from './types';

/** Fetches a fresh JWKS document. Stub in tests. */
export interface JwksFetcher {
  fetch(): Promise<JwkSet>;
}

export class JwksFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwksFetchError';
  }
}

export interface JwksCacheOptions {
  /** Cache lifetime in ms. Default 300_000 (5 min). */
  cacheTtlMs?: number;
  /** Min interval between unknown-kid forced refreshes. Default 30_000. */
  refreshCooldownMs?: number;
  clock?: JwtClock2;
}

export interface KeyResolution {
  readonly jwk: JsonWebKeyObject;
  /** True when the key came from a refresh triggered by this lookup. */
  readonly refreshed: boolean;
}

export class JwksCache {
  private readonly _fetcher: JwksFetcher;
  private readonly _ttlMs: number;
  private readonly _cooldownMs: number;
  private readonly _clock: JwtClock2;

  private _keys: JsonWebKeyObject[] = [];
  private _cachedAtMs = -Infinity;
  /** Last time a *kid-triggered* refresh was attempted — TTL-driven
   *  fetches deliberately don't count toward the DoS cooldown. */
  private _lastKidRefreshAttemptMs = -Infinity;
  private _inflight: Promise<JsonWebKeyObject[]> | null = null;
  private _refreshes = 0;
  private _kidMisses = 0;

  constructor(fetcher: JwksFetcher, opts: JwksCacheOptions = {}) {
    this._fetcher = fetcher;
    this._ttlMs = Math.max(1, opts.cacheTtlMs ?? 300_000);
    this._cooldownMs = Math.max(0, opts.refreshCooldownMs ?? 30_000);
    this._clock = opts.clock ?? new SystemJwtClock2();
  }

  /**
   * Resolve a signing key for a token.
   *
   *  1. If the cache is stale → refresh first.
   *  2. Try exact kid match.
   *  3. Kid miss → force a refresh once per cooldown window, retry match.
   *  4. Still nothing → null (caller should reject the token).
   */
  async resolve(kid: string | undefined, alg?: string): Promise<KeyResolution | null> {
    if (this._isStale()) {
      await this._refresh(false);
    }

    let jwk = this._find(kid, alg);
    if (jwk) return { jwk, refreshed: false };

    // Unknown kid in a fresh cache → one forced refresh per cooldown.
    if (kid !== undefined) {
      this._kidMisses++;
      const now = this._clock.now();
      if (now - this._lastKidRefreshAttemptMs >= this._cooldownMs) {
        this._lastKidRefreshAttemptMs = now;
        await this._refresh(true);
        jwk = this._find(kid, alg);
        if (jwk) return { jwk, refreshed: true };
      }
    }
    return null;
  }

  /** Force a refresh regardless of TTL (single-flighted). */
  async refreshNow(): Promise<JsonWebKeyObject[]> {
    return this._refresh(true);
  }

  /** The currently cached keys (possibly empty before first fetch). */
  keys(): readonly JsonWebKeyObject[] {
    return this._keys;
  }

  isFresh(): boolean {
    return !this._isStale();
  }

  get stats(): { refreshes: number; kidMisses: number; cachedKeys: number } {
    return { refreshes: this._refreshes, kidMisses: this._kidMisses, cachedKeys: this._keys.length };
  }

  /* ---------------------------------------------------------------- */

  private _isStale(): boolean {
    return this._clock.now() - this._cachedAtMs >= this._ttlMs;
  }

  private _find(kid: string | undefined, alg: string | undefined): JsonWebKeyObject | undefined {
    const candidates = this._keys.filter((k) => {
      if (k.use && k.use !== 'sig') return false;
      if (alg && k.alg && k.alg !== alg) return false;
      return true;
    });
    if (kid !== undefined) {
      const exact = candidates.find((k) => k.kid === kid);
      if (exact) return exact;
      return candidates.length === 1 ? candidates[0] : undefined;
    }
    return candidates[0];
  }

  private async _refresh(forced: boolean): Promise<JsonWebKeyObject[]> {
    if (this._inflight) return this._inflight;

    const p = (async () => {
      try {
        const set = await this._fetcher.fetch();
        this._keys = set.keys.slice();
        this._cachedAtMs = this._clock.now();
        this._refreshes++;
        return this._keys;
      } catch (err) {
        if (forced || this._keys.length === 0) {
          throw err instanceof JwksFetchError ? err : new JwksFetchError(String(err));
        }
        // Stale-on-error: keep serving the old set.
        return this._keys;
      }
    })();
    this._inflight = p;
    try {
      return await p;
    } finally {
      this._inflight = null;
    }
  }
}
