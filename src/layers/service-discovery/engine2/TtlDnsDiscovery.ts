/**
 * TtlDnsDiscovery — DNS-based discovery with per-record TTL caching.
 *
 * Unlike the canned SRV table in strategies/DnsResolver, this resolver
 * talks to a pluggable `DnsTransport` (stub-able — no sockets) and caches
 * answers honoring each record's own TTL:
 *
 *  - Positive cache: entries expire at `min(record.ttl, maxTtlSec)`.
 *  - Negative cache: NXDOMAIN/empty answers are cached for
 *    `negativeTtlSec` (RFC 2308 style) to absorb hot-loop lookups of
 *    services that don't exist.
 *  - Stale-if-error: when a refresh query fails and the entry expired,
 *    the stale copy is served for up to `staleIfErrorSec` — matching
 *    resolver behavior under DNS outages.
 *  - Single-flight: concurrent queries for the same name share one
 *    in-flight refresh promise.
 *
 * Cache is a Map keyed by service name; expiry is lazy on read plus an
 * explicit `sweep()`. All lookups O(1) amortized.
 *
 * @module ServiceDiscoveryLayer/Engine2
 */

import { ServiceInstance2, SdClock2, SystemSdClock2 } from './types';

/** A raw DNS answer the transport returns. */
export interface DnsAnswer {
  /** Resolved endpoints; empty = NXDOMAIN-equivalent. */
  readonly endpoints: { host: string; port: number; weight?: number }[];
  /** TTL in seconds advertised by the record. */
  readonly ttlSec: number;
}

/** Pluggable transport — stub for tests, real resolver in production. */
export interface DnsTransport {
  query(serviceName: string): Promise<DnsAnswer>;
}

export class DnsError extends Error {
  readonly serviceName: string;
  constructor(serviceName: string, message: string) {
    super(message);
    this.name = 'DnsError';
    this.serviceName = serviceName;
  }
}

export interface TtlDnsOptions {
  /** Cap on record TTLs in seconds. Default 300. */
  maxTtlSec?: number;
  /** Negative-cache TTL in seconds. Default 30. */
  negativeTtlSec?: number;
  /** How long expired answers may be served on refresh failure. Default 600. */
  staleIfErrorSec?: number;
  readonly clusterId?: string;
  clock?: SdClock2;
}

interface CacheEntry {
  instances: ServiceInstance2[];
  /** Epoch ms when the cached answer stops being fresh. */
  freshUntilMs: number;
  /** Epoch ms after which the stale copy must be discarded. */
  staleUntilMs: number;
  negative: boolean;
}

export class TtlDnsDiscovery {
  private readonly _transport: DnsTransport;
  private readonly _maxTtlSec: number;
  private readonly _negTtlSec: number;
  private readonly _staleSec: number;
  private readonly _clusterId: string;
  private readonly _clock: SdClock2;
  private readonly _cache = new Map<string, CacheEntry>();
  private readonly _inflight = new Map<string, Promise<ServiceInstance2[]>>();

  constructor(transport: DnsTransport, opts: TtlDnsOptions = {}) {
    this._transport = transport;
    this._maxTtlSec = opts.maxTtlSec ?? 300;
    this._negTtlSec = opts.negativeTtlSec ?? 30;
    this._staleSec = opts.staleIfErrorSec ?? 600;
    this._clusterId = opts.clusterId ?? 'dns';
    this._clock = opts.clock ?? new SystemSdClock2();
  }

  /**
   * Resolve a service name to instances, using the TTL cache.
   * Serves stale answers when the refresh fails within the stale window.
   */
  async resolve(serviceName: string): Promise<ServiceInstance2[]> {
    const now = this._clock.now();
    const cached = this._cache.get(serviceName);

    if (cached && now < cached.freshUntilMs) {
      return cached.instances;
    }

    // Single-flight: dedupe concurrent refreshes for the same name.
    const existing = this._inflight.get(serviceName);
    if (existing) return existing;

    const refresh = this._refresh(serviceName, cached);
    this._inflight.set(serviceName, refresh);
    try {
      return await refresh;
    } finally {
      this._inflight.delete(serviceName);
    }
  }

  /** Force a fresh query, bypassing the cache. */
  async refreshNow(serviceName: string): Promise<ServiceInstance2[]> {
    return this._refresh(serviceName, this._cache.get(serviceName));
  }

  /** Would a resolve hit the cache right now? */
  isCachedFresh(serviceName: string): boolean {
    const c = this._cache.get(serviceName);
    return !!c && this._clock.now() < c.freshUntilMs;
  }

  /** Drop expired entries (fresh AND stale windows elapsed). */
  sweep(): number {
    const now = this._clock.now();
    let n = 0;
    for (const [k, v] of this._cache) {
      if (now >= v.staleUntilMs) {
        this._cache.delete(k);
        n++;
      }
    }
    return n;
  }

  invalidate(serviceName: string): boolean {
    return this._cache.delete(serviceName);
  }

  get cacheSize(): number {
    return this._cache.size;
  }

  /* ---------------------------------------------------------------- */

  private async _refresh(
    serviceName: string,
    stale: CacheEntry | undefined
  ): Promise<ServiceInstance2[]> {
    const now = this._clock.now();
    try {
      const answer = await this._transport.query(serviceName);
      const ttlSec = Math.min(answer.ttlSec, this._maxTtlSec);
      const instances: ServiceInstance2[] = answer.endpoints.map((e, i) => ({
        instanceId: `dns:${serviceName}:${e.host}:${e.port}`,
        serviceName,
        host: e.host,
        port: e.port,
        weight: e.weight ?? 1,
        clusterId: this._clusterId,
        metadata: { source: 'dns', ordinal: String(i) },
        registeredAtMs: now,
      }));
      this._cache.set(serviceName, {
        instances,
        freshUntilMs: now + ttlSec * 1000,
        staleUntilMs: now + ttlSec * 1000 + this._staleSec * 1000,
        negative: instances.length === 0,
      });
      return instances;
    } catch (err) {
      // Stale-if-error: serve the expired copy if still within grace.
      if (stale && now < stale.staleUntilMs) {
        return stale.instances;
      }
      // Negative-cache the failure so callers don't hammer the resolver.
      this._cache.set(serviceName, {
        instances: [],
        freshUntilMs: now + this._negTtlSec * 1000,
        staleUntilMs: now + this._negTtlSec * 1000 + this._staleSec * 1000,
        negative: true,
      });
      throw err instanceof DnsError ? err : new DnsError(serviceName, String(err));
    }
  }
}
