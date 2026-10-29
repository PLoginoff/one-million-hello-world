/**
 * EdgeCacheEngine — CDN-like edge cache.
 *
 * Data structures:
 *  - `_objects`:     Map<fullKey, CacheObject> — O(1) exact-key lookups
 *                    in LRU order (Map insertion order; entries are
 *                    re-inserted on hit to move to MRU end).
 *  - `_byBaseKey`:   Map<baseKey, Set<fullKey>> — the Vary index: all
 *                    variants of a URL so purge-by-prefix/tag and
 *                    variant discovery stay cheap.
 *  - `_byTag`:       Map<tag, Set<fullKey>> — tag index for purge-by-tag.
 *  - `_inflight`:    Map<fullKey, Promise<...>> — single-flight request
 *                    coalescing: concurrent misses on one key share a
 *                    single origin fetch.
 *
 * Lookup pipeline (fetch):
 *   1. Normalize request -> base key; find candidate variants in the
 *      Vary index; pick the variant whose stored Vary headers match
 *      this request's header values.
 *   2. Classify freshness:
 *        FRESH      -> HIT (with Age header)
 *        STALE_SWR  -> serve stale, fire background revalidation
 *        SIE/EXPIRED-> conditional revalidation (If-None-Match/IMS);
 *                      304 extends freshness (REVALIDATED), 200 stores
 *                      new object (MISS), error -> serve stale if in
 *                      stale-if-error window (STALE_IF_ERROR) else fail
 *   3. Cache-negative: 4xx/5xx responses may be stored briefly so a
 *      thundering herd on a missing resource is absorbed.
 *
 * @module EdgeCache/Cdn
 */

import { baseKey, varyKey, fullKey } from './CacheKey';
import {
  parseCacheControl,
  negotiateTtl,
  freshness,
  conditionalHeaders,
  parseVary,
  isStatusCacheable,
  Freshness,
} from './CacheControl';
import {
  EdgeRequest,
  EdgeResponse,
  CacheObject,
  CacheMetadata,
  CacheFetchResult,
  CacheDisposition,
  PurgeSelector,
  RegionStats,
  OriginFetcher,
  EdgeCacheEngineConfig,
  DEFAULT_EDGE_CONFIG,
  CdnCacheError,
  EdgeCacheErrorCode,
} from './types';

interface StoreOptions {
  tags?: string[];
  /** Override for negative-cache TTL. */
  negativeTtlSeconds?: number;
}

export class EdgeCacheEngine {
  private readonly _config: EdgeCacheEngineConfig;
  private readonly _objects: Map<string, CacheObject> = new Map();
  private readonly _byBaseKey: Map<string, Set<string>> = new Map();
  private readonly _byTag: Map<string, Set<string>> = new Map();
  private readonly _inflight: Map<string, Promise<CacheFetchResult>> = new Map();
  private readonly _stats: Map<string, RegionStats> = new Map();
  private readonly _now: () => number;

  constructor(config?: Partial<EdgeCacheEngineConfig>, now: () => number = Date.now) {
    this._config = { ...DEFAULT_EDGE_CONFIG, ...config };
    this._now = now;
    for (const r of this._config.regions) this._stats.set(r, this._emptyStats());
    if (!this._stats.has('default')) this._stats.set('default', this._emptyStats());
  }

  private _emptyStats(): RegionStats {
    return { hits: 0, misses: 0, staleServed: 0, revalidations: 0, revalidated304: 0, purges: 0, coalesced: 0, bytes: 0 };
  }

  private _region(req: EdgeRequest): RegionStats {
    const r = req.region ?? 'default';
    let s = this._stats.get(r);
    if (!s) {
      s = this._emptyStats();
      this._stats.set(r, s);
    }
    return s;
  }

  // ------------------------------------------------------------------
  // Fetch
  // ------------------------------------------------------------------

  /**
   * Serve a request through the cache. `fetcher` is called on miss /
   * revalidation / bypass. GET and HEAD only — other methods bypass and
   * additionally purge the affected key (write-through invalidation).
   */
  async fetch(req: EdgeRequest, fetcher: OriginFetcher, opts?: StoreOptions): Promise<CacheFetchResult> {
    const stats = this._region(req);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const resp = await fetcher(req);
      this.purge({ kind: 'prefix', prefix: baseKey(req.url) });
      stats.misses++;
      stats.bytes += resp.body.length;
      return { response: resp, disposition: CacheDisposition.BYPASS };
    }

    // no-store request directive bypasses the lookup entirely
    const reqCc = parseCacheControl(req.headers['cache-control']);
    const base = baseKey(req.url);
    const object = reqCc.noCache ? undefined : this._findVariant(req, base);

    if (object) {
      const now = this._now();
      const f = freshness(object.metadata, now);
      if (f === Freshness.FRESH) {
        stats.hits++;
        object.hits++;
        this._touchLru(object.key);
        return {
          response: this._withAge(object.response, now - object.metadata.storedAt),
          disposition: CacheDisposition.HIT,
          age: Math.floor((now - object.metadata.storedAt) / 1000),
        };
      }
      if (f === Freshness.STALE_SWR) {
        stats.hits++;
        stats.staleServed++;
        object.hits++;
        // Background revalidation — detached, single-flight keyed.
        void this._revalidate(req, object, fetcher, opts).catch(() => undefined);
        return {
          response: this._withAge(object.response, now - object.metadata.storedAt),
          disposition: CacheDisposition.STALE_REVALIDATE,
          age: Math.floor((now - object.metadata.storedAt) / 1000),
        };
      }
      // EXPIRED or SIE — revalidate synchronously (coalesced)
      return this._coalesced(req, object, fetcher, opts, stats, base);
    }

    // No variant at all — full miss
    return this._coalesced(req, undefined, fetcher, opts, stats, base);
  }

  /** Coalesce concurrent misses on the same key onto one origin fetch. */
  private _coalesced(
    req: EdgeRequest,
    existing: CacheObject | undefined,
    fetcher: OriginFetcher,
    opts: StoreOptions | undefined,
    stats: RegionStats,
    base: string
  ): Promise<CacheFetchResult> {
    const flightKey = existing?.key ?? base;
    if (this._config.coalesceRequests) {
      const pending = this._inflight.get(flightKey);
      if (pending) {
        stats.coalesced++;
        return pending.then((r) => ({ ...r }));
      }
    }
    const promise = this._miss(req, existing, fetcher, opts, stats)
      .finally(() => this._inflight.delete(flightKey));
    if (this._config.coalesceRequests) {
      this._inflight.set(flightKey, promise);
    }
    return promise;
  }

  /** Foreground path: fetch origin, handle 304, store if cacheable. */
  private async _miss(
    req: EdgeRequest,
    existing: CacheObject | undefined,
    fetcher: OriginFetcher,
    opts: StoreOptions | undefined,
    stats: RegionStats
  ): Promise<CacheFetchResult> {
    const now = this._now();
    const effectiveReq: EdgeRequest = existing
      ? { ...req, headers: { ...req.headers, ...conditionalHeaders(existing.metadata) } }
      : req;
    if (existing) stats.revalidations++;

    let resp: EdgeResponse;
    try {
      resp = await fetcher(effectiveReq);
    } catch (e) {
      // Origin error — serve stale inside stale-if-error window
      if (existing && freshness(existing.metadata, now) !== Freshness.EXPIRED) {
        stats.staleServed++;
        return {
          response: this._withAge(existing.response, now - existing.metadata.storedAt),
          disposition: CacheDisposition.STALE_IF_ERROR,
          age: Math.floor((now - existing.metadata.storedAt) / 1000),
        };
      }
      throw e instanceof CdnCacheError ? e : new CdnCacheError(EdgeCacheErrorCode.ORIGIN_ERROR, `origin fetch failed: ${(e as Error).message}`);
    }

    // 304: merge freshness headers onto stored entry
    if (existing && resp.status === 304) {
      stats.revalidated304++;
      const ttl = negotiateTtl(resp, { honorSMaxage: this._config.honorSMaxage, defaultTtlSeconds: this._config.defaultTtlSeconds, now });
      const cc = parseCacheControl(resp.headers['cache-control']);
      this._refreshMetadata(existing, ttl ?? existing.metadata.ttlSeconds, cc, now);
      stats.hits++;
      return {
        response: this._withAge(existing.response, now - existing.metadata.storedAt),
        disposition: CacheDisposition.REVALIDATED,
        revalidated304: true,
        age: Math.floor((now - existing.metadata.storedAt) / 1000),
      };
    }

    // Error response with stale-if-error fallback
    if (existing && resp.status >= 500 && freshness(existing.metadata, now) !== Freshness.EXPIRED) {
      stats.staleServed++;
      return {
        response: this._withAge(existing.response, now - existing.metadata.storedAt),
        disposition: CacheDisposition.STALE_IF_ERROR,
        age: Math.floor((now - existing.metadata.storedAt) / 1000),
      };
    }

    stats.misses++;
    stats.bytes += resp.body.length;
    const stored = this._maybeStore(req, resp, opts, now);
    return {
      response: stored ? { ...resp, headers: { ...resp.headers, age: '0' } } : resp,
      disposition: stored ? CacheDisposition.MISS : CacheDisposition.BYPASS,
    };
  }

  /** Background SWR revalidation — same store/304 logic minus serving. */
  private async _revalidate(
    req: EdgeRequest,
    object: CacheObject,
    fetcher: OriginFetcher,
    opts: StoreOptions | undefined
  ): Promise<void> {
    const flightKey = object.key;
    if (this._inflight.has(flightKey)) return; // already revalidating
    const stats = this._region(req);
    const promise = this._miss(req, object, fetcher, opts, stats)
      .finally(() => this._inflight.delete(flightKey));
    this._inflight.set(flightKey, promise);
    await promise.catch(() => undefined);
  }

  // ------------------------------------------------------------------
  // Storage
  // ------------------------------------------------------------------

  /** Store if cacheable; returns true if stored. */
  private _maybeStore(req: EdgeRequest, resp: EdgeResponse, opts: StoreOptions | undefined, now: number): boolean {
    const cc = parseCacheControl(resp.headers['cache-control']);
    if (cc.noStore || cc.private_ || cc.noCache) return false;

    const { headers: varyHeaders, wildcard } = parseVary(resp);
    if (wildcard) return false; // Vary: * — never shared-cacheable

    let ttl: number | undefined;
    const negative = resp.status >= 400 && resp.status < 600;
    if (negative) {
      const negTtl = opts?.negativeTtlSeconds ?? this._config.negativeTtlSeconds;
      ttl = cc.maxAge ?? cc.sMaxAge ?? (negTtl > 0 ? negTtl : undefined);
    } else {
      ttl = negotiateTtl(resp, {
        honorSMaxage: this._config.honorSMaxage,
        defaultTtlSeconds: this._config.defaultTtlSeconds,
        now,
      });
    }
    if (ttl === undefined || ttl <= 0) return false;
    if (!negative && !isStatusCacheable(resp.status) && cc.maxAge === undefined && cc.sMaxAge === undefined) {
      return false;
    }

    const meta: CacheMetadata = {
      ttlSeconds: ttl,
      storedAt: now,
      freshUntil: now + ttl * 1000,
      swrUntil: cc.staleWhileRevalidate !== undefined ? now + (ttl + cc.staleWhileRevalidate) * 1000 : undefined,
      sieUntil: cc.staleIfError !== undefined ? now + (ttl + cc.staleIfError) * 1000 : undefined,
      validators: {
        etag: resp.headers['etag'],
        lastModified: Date.parse(resp.headers['last-modified'] ?? '') || undefined,
      },
      vary: varyHeaders,
      tags: opts?.tags ?? [],
      originStatus: resp.status,
    };

    const key = fullKey(req.url, varyHeaders, req.headers);
    this._evictIfNeeded();
    this._insert(key, { key, response: resp, metadata: meta, hits: 0 });
    return true;
  }

  /** Refresh metadata after a 304 revalidation. */
  private _refreshMetadata(object: CacheObject, ttlSeconds: number, cc: ReturnType<typeof parseCacheControl>, now: number): void {
    object.metadata.ttlSeconds = ttlSeconds;
    object.metadata.storedAt = now;
    object.metadata.freshUntil = now + ttlSeconds * 1000;
    object.metadata.swrUntil = cc.staleWhileRevalidate !== undefined ? now + (ttlSeconds + cc.staleWhileRevalidate) * 1000 : undefined;
    object.metadata.sieUntil = cc.staleIfError !== undefined ? now + (ttlSeconds + cc.staleIfError) * 1000 : undefined;
  }

  private _insert(key: string, object: CacheObject): void {
    // Replace: drop from indexes first so tags/base don't go stale.
    if (this._objects.has(key)) this._remove(key);
    this._objects.set(key, object);
    const { path } = splitVary(key);
    let set = this._byBaseKey.get(path);
    if (!set) {
      set = new Set();
      this._byBaseKey.set(path, set);
    }
    set.add(key);
    for (const tag of object.metadata.tags) {
      let ts = this._byTag.get(tag);
      if (!ts) {
        ts = new Set();
        this._byTag.set(tag, ts);
      }
      ts.add(key);
    }
  }

  private _remove(key: string): boolean {
    const obj = this._objects.get(key);
    if (!obj) return false;
    this._objects.delete(key);
    const { path } = splitVary(key);
    const set = this._byBaseKey.get(path);
    if (set) {
      set.delete(key);
      if (set.size === 0) this._byBaseKey.delete(path);
    }
    for (const tag of obj.metadata.tags) {
      const ts = this._byTag.get(tag);
      if (ts) {
        ts.delete(key);
        if (ts.size === 0) this._byTag.delete(tag);
      }
    }
    return true;
  }

  /**
   * Find the variant of `base` matching this request's Vary headers.
   * Each stored key embeds its own vary suffix (computed at store time
   * from the original request's header values); a request matches when
   * its recomputed suffix equals the stored key's suffix.
   */
  private _findVariant(req: EdgeRequest, base: string): CacheObject | undefined {
    const variants = this._byBaseKey.get(base);
    if (!variants || variants.size === 0) return undefined;
    for (const key of variants) {
      const obj = this._objects.get(key);
      if (!obj) continue;
      const i = key.indexOf('|');
      const storedSuffix = i < 0 ? '' : key.slice(i);
      if (varyKey(obj.metadata.vary, req.headers) === storedSuffix) {
        return obj;
      }
    }
    return undefined;
  }

  /** LRU: move key to MRU position (Map order). */
  private _touchLru(key: string): void {
    const obj = this._objects.get(key);
    if (!obj) return;
    this._objects.delete(key);
    this._objects.set(key, obj);
  }

  /** Evict least-recently-used entries to stay under capacity. */
  private _evictIfNeeded(): void {
    while (this._objects.size >= this._config.capacity && this._objects.size > 0) {
      const oldest = this._objects.keys().next().value;
      if (oldest === undefined) break;
      this._remove(oldest);
    }
  }

  /** Attach an Age header without mutating the stored response. */
  private _withAge(resp: EdgeResponse, ageMs: number): EdgeResponse {
    return { ...resp, headers: { ...resp.headers, age: String(Math.floor(ageMs / 1000)) } };
  }

  // ------------------------------------------------------------------
  // Purge
  // ------------------------------------------------------------------

  /** Purge by key/tag/prefix/all. Returns count removed. */
  purge(selector: PurgeSelector): number {
    const stats = [...this._stats.values()][0];
    let removed = 0;
    switch (selector.kind) {
      case 'all': {
        removed = this._objects.size;
        this._objects.clear();
        this._byBaseKey.clear();
        this._byTag.clear();
        break;
      }
      case 'key': {
        // Exact full key, or any variant under the base key
        if (this._remove(selector.key)) {
          removed++;
        } else {
          const variants = this._byBaseKey.get(selector.key);
          if (variants) {
            for (const k of [...variants]) if (this._remove(k)) removed++;
          }
        }
        break;
      }
      case 'tag': {
        const set = this._byTag.get(selector.tag);
        if (set) {
          for (const k of [...set]) if (this._remove(k)) removed++;
        }
        break;
      }
      case 'prefix': {
        const toDelete: string[] = [];
        for (const base of this._byBaseKey.keys()) {
          if (base.startsWith(selector.prefix)) {
            const set = this._byBaseKey.get(base);
            if (set) for (const k of set) toDelete.push(k);
          }
        }
        for (const k of toDelete) if (this._remove(k)) removed++;
        break;
      }
    }
    if (stats) stats.purges += removed;
    return removed;
  }

  // ------------------------------------------------------------------
  // Introspection
  // ------------------------------------------------------------------

  /** Peek at a stored object by exact full key (tests/diagnostics). */
  peek(key: string): CacheObject | undefined {
    return this._objects.get(key);
  }

  /** Keys for a base path (all variants). */
  variantsOf(base: string): string[] {
    return [...(this._byBaseKey.get(base) ?? [])];
  }

  /** Snapshot of per-region stats. */
  stats(): Record<string, RegionStats> {
    const out: Record<string, RegionStats> = {};
    for (const [r, s] of this._stats) out[r] = { ...s };
    return out;
  }

  size(): number {
    return this._objects.size;
  }
}

/** Split a full key back into its base path (used for index bookkeeping). */
function splitVary(full: string): { path: string } {
  const i = full.indexOf('|');
  return { path: i < 0 ? full : full.slice(0, i) };
}
