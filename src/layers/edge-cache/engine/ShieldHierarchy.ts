/**
 * ShieldHierarchy — multi-level origin shielding with coalescing at each level.
 *
 * `OriginShield` (cdn/) is a single coalescing layer. Real CDN topologies
 * chain them: edge PoP → regional shield → central shield → origin. A miss
 * at the edge tries the regional shield, which itself coalesces and only
 * misses through to the central shield, which coalesces once more before
 * the origin. Each level drops origin pressure by roughly an order of
 * magnitude.
 *
 *   EdgeCacheEngine.fetch()
 *        │ miss
 *        ▼
 *   RegionalShield.fetch()   ← per-region single-flight
 *        │ miss (after regional coalescing)
 *        ▼
 *   CentralShield.fetch()    ← global single-flight (OriginShield)
 *        │
 *        ▼
 *      origin
 *
 * Request coalescing at EACH level: two regions fetching the same key
 * coalesce at the central shield (existing OriginShield), and two edges
 * inside the same region coalesce at the regional shield — so the
 * central shield sees max 1 request per region, and the origin sees 1.
 *
 * Regional shields carry a per-region cache too (shield caching: a
 * coalesced response is retained briefly so subsequent misses in the
 * same region don't even reach central). TTL kept short — this layer is
 * a stampede barrier, not a second CDN.
 *
 * @module EdgeCache/Engine
 */

import { EdgeRequest, EdgeResponse, OriginFetcher } from '../cdn/types';
import { baseKey } from '../cdn/CacheKey';
import { OriginShield } from '../cdn/OriginShield';
import { IClock, SystemClock } from '../../observability/engine/signals';

export interface RegionalShieldStats {
  region: string;
  requests: number;
  /** Served from the regional shield cache. */
  shieldHits: number;
  /** Coalesced onto an in-flight regional fetch. */
  coalesced: number;
  /** Misses forwarded to the next level (central shield / origin). */
  forwarded: number;
}

export interface RegionalShieldConfig {
  /** How long a fetched response is retained at the regional level. */
  readonly shieldTtlMs?: number;
  /** Cacheable statuses at the shield level. */
  readonly cacheableStatuses?: readonly number[];
}

const DEFAULTS: Required<RegionalShieldConfig> = {
  shieldTtlMs: 30_000,
  cacheableStatuses: [200, 301, 302, 404],
};

/**
 * One regional shield: per-region single-flight + short-TTL shield cache.
 * `next` is the next level's fetcher (typically the CentralShield's
 * fetch bound to an OriginShield).
 */
export class RegionalShield {
  readonly region: string;
  private readonly _config: Required<RegionalShieldConfig>;
  private readonly _clock: IClock;
  private readonly _inflight = new Map<string, Promise<EdgeResponse>>();
  private readonly _cache = new Map<string, { resp: EdgeResponse; freshUntil: number }>();
  private readonly _stats: RegionalShieldStats;

  constructor(region: string, config: RegionalShieldConfig = {}, clock: IClock = new SystemClock()) {
    this.region = region;
    this._config = { ...DEFAULTS, ...config };
    this._clock = clock;
    this._stats = { region, requests: 0, shieldHits: 0, coalesced: 0, forwarded: 0 };
  }

  /** Fetch through the regional shield. `next` = next level fetcher. */
  async fetch(req: EdgeRequest, next: OriginFetcher): Promise<EdgeResponse> {
    this._stats.requests++;
    const key = req.method + ' ' + baseKey(req.url);
    const now = this._clock.nowMs();

    // 1) Regional shield cache.
    const cached = this._cache.get(key);
    if (cached && cached.freshUntil > now) {
      this._stats.shieldHits++;
      return { ...cached.resp };
    }

    // 2) Single-flight within the region.
    const pending = this._inflight.get(key);
    if (pending) {
      this._stats.coalesced++;
      return pending.then((r) => ({ ...r }));
    }

    // 3) Forward to next level; retain cacheable responses briefly.
    this._stats.forwarded++;
    const promise = next(req)
      .then((resp) => {
        if (this._config.cacheableStatuses.includes(resp.status)) {
          this._cache.set(key, { resp, freshUntil: this._clock.nowMs() + this._config.shieldTtlMs });
        }
        return resp;
      })
      .finally(() => this._inflight.delete(key));
    this._inflight.set(key, promise);
    return promise;
  }

  stats(): RegionalShieldStats {
    return { ...this._stats };
  }

  /** Drop expired shield-cache entries (housekeeping). */
  sweep(): number {
    const now = this._clock.nowMs();
    let n = 0;
    for (const [k, v] of this._cache) {
      if (v.freshUntil <= now) {
        this._cache.delete(k);
        n++;
      }
    }
    return n;
  }
}

/**
 * The full hierarchy: N regional shields in front of ONE central shield
 * (an OriginShield with its own coalescing + concurrency cap + retries).
 *
 * `fetch(req)` routes by `req.region` (or a named default region).
 */
export class ShieldHierarchy {
  private readonly _central: OriginShield;
  private readonly _regions = new Map<string, RegionalShield>();
  private readonly _clock: IClock;
  private readonly _defaultRegion: string;

  constructor(opts: {
    regions: readonly string[];
    shieldTtlMs?: number;
    centralConfig?: { maxConcurrency?: number; maxRetries?: number; retryBaseMs?: number };
    defaultRegion?: string;
    clock?: IClock;
  }) {
    this._clock = opts.clock ?? new SystemClock();
    this._central = new OriginShield(opts.centralConfig);
    this._defaultRegion = opts.defaultRegion ?? opts.regions[0] ?? 'default';
    for (const r of opts.regions) {
      this._regions.set(r, new RegionalShield(r, { shieldTtlMs: opts.shieldTtlMs }, this._clock));
    }
  }

  /** Next-level fetcher: route through the central OriginShield. */
  private _centralFetch: OriginFetcher = async (req) => {
    // The OriginShield coalesces + rate-limits the true origin fetch.
    return this._central.fetch(req, this._origin ?? (async () => {
      throw new Error('no origin fetcher bound');
    }));
  };

  private _origin: OriginFetcher | null = null;

  /** Bind the true origin (done once at wiring time). */
  bindOrigin(origin: OriginFetcher): this {
    this._origin = origin;
    return this;
  }

  /** A shield for `region` (auto-created if unregistered). */
  shield(region: string): RegionalShield {
    let s = this._regions.get(region);
    if (!s) {
      s = new RegionalShield(region, {}, this._clock);
      this._regions.set(region, s);
    }
    return s;
  }

  /**
   * Fetch through the hierarchy: regional shield → central shield → origin.
   */
  async fetch(req: EdgeRequest): Promise<EdgeResponse> {
    if (!this._origin) throw new Error('ShieldHierarchy: call bindOrigin() first');
    const region = req.region ?? this._defaultRegion;
    return this.shield(region).fetch(req, this._centralFetch);
  }

  /** Aggregate stats per level. */
  stats(): { regions: RegionalShieldStats[]; central: ReturnType<OriginShield['stats']> } {
    return {
      regions: [...this._regions.values()].map((s) => s.stats()),
      central: this._central.stats(),
    };
  }
}
