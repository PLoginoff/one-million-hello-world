/**
 * Multi-Tenancy — Tenant-Scoped Resource Pools + Cache
 *
 * Two cross-cutting infrastructure pieces that become correct only when
 * tenant-aware:
 *
 *   - `TenantResourcePool`: a pool (of DB connections, worker handles, etc.)
 *     where each tenant gets its own bounded bucket. A noisy tenant can
 *     exhaust ITS pool but never starve the shared pool for others —
 *     bounded-noise-isolation, the whole reason pools exist in MT systems.
 *   - `TenantCache`: a cache whose keys are (tenantId, key) pairs — the
 *     correct way to cache tenant-scoped data. A tenant-scoped cache miss
 *     can't leak another tenant's entry because lookup is always under the
 *     ambient tenant. Eviction is per-tenant-fair: when full, the victim is
 *     the globally-least-recently-used entry, not "any entry of the victim
 *     tenant".
 *
 * @module MultiTenancy/Tenancy
 */

import { TenantContext } from './TenantContext';
import { TenantError, TenantErrorCode, TenancyClock } from './TenantTypes';

// --------------------------------------------------------------------- pool

export interface PoolOptions {
  /** Max resources per tenant bucket. */
  readonly perTenant: number;
  /** Max total live resources across all tenants (global cap). */
  readonly maxTotal?: number;
  /** Resource factory — receives the tenant id. */
  readonly factory: (tenantId: string) => Promise<PooledResource> | PooledResource;
  /** Optional async destroy on release-of-last-use (e.g. closing handles). */
  readonly destroy?: (r: PooledResource) => Promise<void> | void;
  readonly clock?: TenancyClock;
}

export interface PooledResource {
  readonly id: string;
  /** Provider-specific payload — opaque to the pool. */
  readonly payload: unknown;
}

interface PoolEntry {
  resource: PooledResource;
  inUse: boolean;
  lastUsedAt: number;
}

interface Bucket {
  entries: PoolEntry[];
}

/**
 * A pool partitioned by tenant. `acquire` runs inside a TenantContext and
 * draws from that tenant's bucket only — cross-tenant resource sharing
 * (which would leak connection state) is structurally impossible.
 */
export class TenantResourcePool {
  private readonly _perTenant: number;
  private readonly _maxTotal: number;
  private readonly _factory: (tenantId: string) => Promise<PooledResource> | PooledResource;
  private readonly _destroy: ((r: PooledResource) => Promise<void> | void) | undefined;
  private readonly _clock: TenancyClock;
  private readonly _buckets = new Map<string, Bucket>();
  private _total = 0;

  constructor(options: PoolOptions) {
    this._perTenant = options.perTenant;
    this._maxTotal = options.maxTotal ?? Number.MAX_SAFE_INTEGER;
    this._factory = options.factory;
    this._destroy = options.destroy;
    this._clock = options.clock ?? Date.now;
  }

  get totalLive(): number {
    return this._total;
  }

  /** Acquire a resource for the ambient tenant. Returns resource + release. */
  async acquire(): Promise<{ resource: PooledResource; release: () => Promise<void> }> {
    const tenantId = TenantContext.require().tenantId;
    const bucket = this._bucket(tenantId);

    // Reuse a free entry in the tenant's bucket first.
    const free = bucket.entries.find((e) => !e.inUse);
    if (free) {
      free.inUse = true;
      free.lastUsedAt = this._clock();
      return { resource: free.resource, release: () => this._release(free) };
    }

    // Grow the bucket — bounded by per-tenant cap.
    if (bucket.entries.length >= this._perTenant) {
      throw new TenantError(
        TenantErrorCode.QUOTA_EXCEEDED,
        `tenant '${tenantId}' exhausted its pool (cap ${this._perTenant})`
      );
    }
    // Global cap → steal the globally-idle-oldest entry (LRU reclamation).
    if (this._total >= this._maxTotal) {
      const reclaimed = await this._reclaimOldestIdle();
      if (!reclaimed) {
        throw new TenantError(TenantErrorCode.QUOTA_EXCEEDED, 'global pool exhausted — all resources in use');
      }
    }

    const resource = await this._factory(tenantId);
    const entry: PoolEntry = { resource, inUse: true, lastUsedAt: this._clock() };
    bucket.entries.push(entry);
    this._total++;
    return { resource, release: () => this._release(entry) };
  }

  /** Idle resources for a tenant (diagnostics). */
  idleCount(tenantId: string): number {
    return (this._buckets.get(tenantId)?.entries ?? []).filter((e) => !e.inUse).length;
  }

  /** Drain a tenant's bucket (purge-time cleanup). Destroys every entry. */
  async drain(tenantId: string): Promise<number> {
    const bucket = this._buckets.get(tenantId);
    if (!bucket) return 0;
    const n = bucket.entries.length;
    for (const e of bucket.entries) {
      await this._destroy?.(e.resource);
      this._total--;
    }
    this._buckets.delete(tenantId);
    return n;
  }

  private _bucket(tenantId: string): Bucket {
    let b = this._buckets.get(tenantId);
    if (!b) {
      b = { entries: [] };
      this._buckets.set(tenantId, b);
    }
    return b;
  }

  private async _release(entry: PoolEntry): Promise<void> {
    entry.inUse = false;
    entry.lastUsedAt = this._clock();
  }

  /**
   * Reclaim the globally idle-oldest entry to make room under the global
   * cap. Destroys the resource (calls `destroy`) and frees the slot.
   */
  private async _reclaimOldestIdle(): Promise<boolean> {
    let oldest: { bucket: Bucket; entry: PoolEntry } | undefined;
    for (const bucket of this._buckets.values()) {
      for (const e of bucket.entries) {
        if (!e.inUse && (oldest === undefined || e.lastUsedAt < oldest.entry.lastUsedAt)) {
          oldest = { bucket, entry: e };
        }
      }
    }
    if (!oldest) return false;
    const idx = oldest.bucket.entries.indexOf(oldest.entry);
    if (idx >= 0) oldest.bucket.entries.splice(idx, 1);
    await this._destroy?.(oldest.entry.resource);
    this._total--;
    return true;
  }
}

// -------------------------------------------------------------------- cache

interface CacheEntry<T> {
  value: T;
  tenantId: string;
  lastAccessAt: number;
}

export interface TenantCacheOptions {
  readonly maxEntries?: number;
  readonly clock?: TenancyClock;
}

/**
 * Tenant-scoped cache. Keys are implicitly (ambient-tenant, key) — there is
 * no API to read another tenant's entry because the tenant always comes
 * from the context. Eviction is global LRU across tenants (a big tenant's
 * hot entries can't evict a small tenant's warm ones by sheer volume — the
 * *least-recently-used* entry loses, wherever it lives).
 */
export class TenantCache<T = unknown> {
  private readonly _map = new Map<string, CacheEntry<T>>();
  private readonly _maxEntries: number;
  private readonly _clock: TenancyClock;

  constructor(options: TenantCacheOptions = {}) {
    this._maxEntries = options.maxEntries ?? 10_000;
    this._clock = options.clock ?? Date.now;
  }

  get size(): number {
    return this._map.size;
  }

  get(key: string): T | undefined {
    const tenantId = TenantContext.require().tenantId;
    const e = this._map.get(this._compound(tenantId, key));
    if (!e) return undefined;
    e.lastAccessAt = this._clock();
    return e.value;
  }

  set(key: string, value: T): void {
    const tenantId = TenantContext.require().tenantId;
    if (this._map.size >= this._maxEntries && !this._map.has(this._compound(tenantId, key))) {
      this._evictLru();
    }
    this._map.set(this._compound(tenantId, key), { value, tenantId, lastAccessAt: this._clock() });
  }

  delete(key: string): boolean {
    const tenantId = TenantContext.require().tenantId;
    return this._map.delete(this._compound(tenantId, key));
  }

  /** Drop every entry of a tenant (purge / tenant teardown). */
  evictTenant(tenantId: string): number {
    let n = 0;
    for (const [k, e] of [...this._map.entries()]) {
      if (e.tenantId === tenantId) {
        this._map.delete(k);
        n++;
      }
    }
    return n;
  }

  /** Entries a tenant currently holds (diagnostics / fair-usage reports). */
  tenantSize(tenantId: string): number {
    let n = 0;
    for (const e of this._map.values()) if (e.tenantId === tenantId) n++;
    return n;
  }

  private _compound(tenantId: string, key: string): string {
    return `${tenantId}${key}`;
  }

  private _evictLru(): void {
    let oldestKey: string | undefined;
    let oldestAt = Infinity;
    for (const [k, e] of this._map) {
      if (e.lastAccessAt < oldestAt) {
        oldestAt = e.lastAccessAt;
        oldestKey = k;
      }
    }
    if (oldestKey !== undefined) this._map.delete(oldestKey);
  }
}
