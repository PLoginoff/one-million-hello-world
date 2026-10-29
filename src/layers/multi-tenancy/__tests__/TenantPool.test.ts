/**
 * Multi-Tenancy — resource pool + tenant cache tests.
 */

import { describe, it, expect } from 'bun:test';
import { TenantCache, TenantContext, TenantError, TenantErrorCode, TenantResourcePool } from '../tenancy';

describe('TenantResourcePool', () => {
  function makePool(perTenant = 2, maxTotal = 4) {
    let seq = 0;
    const destroyed: string[] = [];
    const pool = new TenantResourcePool({
      perTenant,
      maxTotal,
      factory: (tenantId) => ({ id: `${tenantId}-${++seq}`, payload: {} }),
      destroy: (r) => { destroyed.push(r.id); },
      clock: (() => { let t = 0; return () => ++t; })(),
    });
    return { pool, destroyed };
  }

  it('per-tenant bucket isolation — noisy tenant hits its own cap', async () => {
    const { pool } = makePool(1, 10);
    await TenantContext.runWith('a', 'explicit', async () => {
      const r1 = await pool.acquire();
      // 'a' bucket exhausted (perTenant=1).
      await expect(pool.acquire()).rejects.toMatchObject({ code: TenantErrorCode.QUOTA_EXCEEDED });
      await r1.release();
      // Now reusable.
      const r2 = await pool.acquire();
      expect(r2.resource.id).toBe(r1.resource.id);
      await r2.release();
    });
    // 'b' unaffected.
    await TenantContext.runWith('b', 'explicit', async () => {
      const r = await pool.acquire();
      await r.release();
    });
  });

  it('global cap reclaims the globally-idle-oldest entry', async () => {
    const { pool, destroyed } = makePool(2, 2); // maxTotal 2
    let rid = '';
    await TenantContext.runWith('a', 'explicit', async () => {
      const r = await pool.acquire();
      rid = r.resource.id;
      await r.release(); // idle — stealable
    });
    await TenantContext.runWith('b', 'explicit', async () => {
      const r = await pool.acquire();
      rid = r.resource.id; // still in use — not stealable
    });
    // 'c' acquire: global cap hit, must reclaim 'a's idle entry.
    await TenantContext.runWith('c', 'explicit', async () => {
      const r = await pool.acquire();
      await r.release();
    });
    expect(destroyed.length).toBe(1);
    void rid;
  });

  it('drain destroys every entry of a tenant', async () => {
    const { pool, destroyed } = makePool();
    await TenantContext.runWith('a', 'explicit', async () => {
      await pool.acquire();
      const r2 = await pool.acquire();
      await r2.release();
    });
    expect(pool.totalLive).toBe(2);
    const n = await pool.drain('a');
    expect(n).toBe(2);
    expect(destroyed.length).toBe(2);
    expect(pool.totalLive).toBe(0);
  });
});

describe('TenantCache', () => {
  it('implicit tenant scoping — no cross-tenant reads', () => {
    const cache = new TenantCache<string>();
    TenantContext.runWith('t1', 'explicit', () => cache.set('k', 'v1'));
    TenantContext.runWith('t2', 'explicit', () => {
      expect(cache.get('k')).toBeUndefined();
      cache.set('k', 'v2');
      expect(cache.get('k')).toBe('v2');
    });
    TenantContext.runWith('t1', 'explicit', () => expect(cache.get('k')).toBe('v1'));
  });

  it('global LRU eviction is fair across tenants', () => {
    let t = 0;
    const cache = new TenantCache<string>({ maxEntries: 2, clock: () => ++t });
    TenantContext.runWith('a', 'explicit', () => cache.set('old', 'a-old')); // t=1
    TenantContext.runWith('b', 'explicit', () => cache.set('mid', 'b-mid')); // t=2
    TenantContext.runWith('c', 'explicit', () => cache.set('new', 'c-new')); // t=3 → evicts a's (oldest)
    TenantContext.runWith('a', 'explicit', () => expect(cache.get('old')).toBeUndefined());
    TenantContext.runWith('b', 'explicit', () => expect(cache.get('mid')).toBe('b-mid'));
  });

  it('evictTenant clears a tenant without touching others', () => {
    const cache = new TenantCache<string>();
    TenantContext.runWith('a', 'explicit', () => { cache.set('x', '1'); cache.set('y', '2'); });
    TenantContext.runWith('b', 'explicit', () => cache.set('x', 'b'));
    expect(cache.evictTenant('a')).toBe(2);
    expect(cache.size).toBe(1);
  });
});
