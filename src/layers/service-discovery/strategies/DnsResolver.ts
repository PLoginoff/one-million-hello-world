/**
 * DnsResolver
 *
 * DNS-style service discovery stub: resolves `service.domain` names to
 * A/AAAA/SRV records. Ships with a canned record table (no real DNS over the
 * wire — pure data structure + interface) so it can be used in tests and as
 * a fallback when a discovery backend is unavailable.
 *
 * Supports:
 *  - `SRV` records: `serviceName → [{host,port,priority,weight}]`
 *  - `A` records: `host → [ip]`
 *  - weighted SRV selection (RFC 2782 ordering: priority asc, weight random-proportional)
 *
 * @module ServiceDiscoveryLayer/Strategies
 */

/** A DNS SRV record. */
export interface SrvRecord {
  /** Hostname the service lives on. */
  readonly target: string;
  readonly port: number;
  /** Lower priority = preferred (RFC 2782). */
  readonly priority: number;
  /** Weight within a priority class (0 = never chosen). */
  readonly weight: number;
  readonly ttl: number;
}

export interface DnsResolverConfig {
  /** Cache TTL cap in ms (records may specify shorter). */
  maxCacheTtlMs?: number;
  /** RNG for weighted SRV pick (injectable for tests). */
  rng?: () => number;
}

interface CacheEntry {
  records: SrvRecord[];
  expiresAt: number;
}

/**
 * Stub resolver backed by a record table.
 */
export class DnsResolver {
  private readonly _srvTable: Map<string, SrvRecord[]>;
  private readonly _aTable: Map<string, string[]>;
  private readonly _cache: Map<string, CacheEntry>;
  private readonly _maxCacheTtlMs: number;
  private readonly _rng: () => number;
  private _queries: number;
  private _cacheHits: number;

  constructor(config: DnsResolverConfig = {}) {
    this._srvTable = new Map();
    this._aTable = new Map();
    this._cache = new Map();
    this._maxCacheTtlMs = config.maxCacheTtlMs ?? 30_000;
    this._rng = config.rng ?? Math.random;
    this._queries = 0;
    this._cacheHits = 0;
  }

  /** Seed an SRV answer for a service name (e.g. `_orders._tcp.local`). */
  setSrv(name: string, records: SrvRecord[]): void {
    this._srvTable.set(name, records.slice());
    this._cache.delete(`SRV:${name}`);
  }

  /** Seed A records for a hostname. */
  setA(host: string, ips: string[]): void {
    this._aTable.set(host, ips.slice());
  }

  /** Resolve service → list of SRV records (uncached path). */
  lookupSrv(name: string): SrvRecord[] {
    this._queries += 1;
    const cached = this._cache.get(`SRV:${name}`);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      this._cacheHits += 1;
      return cached.records.slice();
    }
    const records = this._srvTable.get(name) ?? [];
    if (records.length > 0) {
      const minTtl = Math.min(...records.map((r) => r.ttl)) * 1000;
      this._cache.set(`SRV:${name}`, {
        records: records.slice(),
        expiresAt: now + Math.min(minTtl, this._maxCacheTtlMs),
      });
    }
    return records.slice();
  }

  /** Resolve hostname → IPs. */
  lookupA(host: string): string[] {
    this._queries += 1;
    return (this._aTable.get(host) ?? []).slice();
  }

  /**
   * Pick a target using RFC 2782 ordering: sort by priority, then within the
   * best priority class pick proportionally to weight.
   */
  pickTarget(name: string): SrvRecord | undefined {
    const records = this.lookupSrv(name);
    if (records.length === 0) {
      return undefined;
    }
    const bestPriority = Math.min(...records.map((r) => r.priority));
    const candidates = records.filter((r) => r.priority === bestPriority);
    const totalWeight = candidates.reduce((s, r) => s + r.weight, 0);
    if (totalWeight <= 0) {
      return candidates[0];
    }
    let roll = this._rng() * totalWeight;
    for (const r of candidates) {
      roll -= r.weight;
      if (roll < 0) {
        return r;
      }
    }
    return candidates[candidates.length - 1];
  }

  get queryCount(): number {
    return this._queries;
  }

  get cacheHits(): number {
    return this._cacheHits;
  }

  get cacheSize(): number {
    return this._cache.size;
  }

  clearCache(): void {
    this._cache.clear();
  }
}
