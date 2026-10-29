/**
 * Multi-Tenancy — engine tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  CompositeResolver,
  HeaderResolver,
  QueryResolver,
  SchemaPerTenantResolver,
  SubdomainResolver,
  TenancyMiddleware,
  TenantContext,
  TenantError,
  TenantErrorCode,
  TenantQuotaManager,
  TenantRegistry,
  TenantScopedStore,
  TenantStatus,
  TokenClaimResolver,
  assertSameTenant,
} from '../tenancy';

function makeStack(now?: { t: number }) {
  const clock = now ? () => now.t : Date.now;
  const registry = new TenantRegistry(clock);
  const quotas = new TenantQuotaManager({ requestsPerWindow: 3, windowMs: 60_000 }, clock);
  const resolvers = new CompositeResolver([
    new HeaderResolver(),
    new SubdomainResolver(['api.example.com']),
    new TokenClaimResolver(),
  ]);
  const mw = new TenancyMiddleware({
    registry,
    resolvers,
    quotas,
    baseConfig: { features: { beta: false }, limits: { seats: 5 } },
    clock,
  });
  return { registry, quotas, resolvers, mw };
}

describe('TenantContext (async-safe)', () => {
  it('propagates through awaits and nested runs', async () => {
    await TenantContext.runWith('t1', 'explicit', async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(TenantContext.current()?.tenantId).toBe('t1');
      await TenantContext.runWith('t2', 'explicit', async () => {
        expect(TenantContext.current()?.tenantId).toBe('t2');
      });
      expect(TenantContext.current()?.tenantId).toBe('t1'); // restored
    });
    expect(TenantContext.current()).toBeUndefined();
  });

  it('isolation between concurrent async scopes', async () => {
    const results = await Promise.all([
      TenantContext.runWith('a', 'explicit', async () => {
        await new Promise((r) => setTimeout(r, 5));
        return TenantContext.current()?.tenantId;
      }),
      TenantContext.runWith('b', 'explicit', async () => {
        await new Promise((r) => setTimeout(r, 1));
        return TenantContext.current()?.tenantId;
      }),
    ]);
    expect(results).toEqual(['a', 'b']);
  });

  it('require throws outside a scope', () => {
    expect(() => TenantContext.require()).toThrow(TenantError);
  });
});

describe('resolvers', () => {
  it('subdomain resolves leftmost label, skips www and apex', () => {
    const r = new SubdomainResolver(['api.example.com', 'example.com']);
    expect(r.resolve({ headers: {}, host: 'acme.api.example.com' })).toBe('acme');
    expect(r.resolve({ headers: {}, host: 'acme.example.com' })).toBe('acme');
    expect(r.resolve({ headers: {}, host: 'api.example.com' })).toBeUndefined();
    expect(r.resolve({ headers: {}, host: 'www.api.example.com' })).toBeUndefined();
    expect(r.resolve({ headers: {}, host: 'other.org' })).toBeUndefined();
  });

  it('header + token-claim + query', () => {
    expect(new HeaderResolver().resolve({ headers: { 'x-tenant-id': 'acme' } })).toBe('acme');
    expect(new TokenClaimResolver().resolve({ headers: {}, tokenClaims: { org_id: 'org9' } })).toBe('org9');
    expect(new TokenClaimResolver('custom').resolve({ headers: {}, tokenClaims: { custom: 'c1' } })).toBe('c1');
    expect(new QueryResolver().resolve({ headers: {}, query: { tenant: 'q1' } })).toBe('q1');
  });

  it('composite prefers earlier resolver', () => {
    const c = new CompositeResolver([new HeaderResolver(), new TokenClaimResolver()]);
    const hit = c.resolve({ headers: { 'x-tenant-id': 'h1' }, tokenClaims: { tenant: 'tk1' } });
    expect(hit?.tenantId).toBe('h1');
    expect(hit?.resolvedBy).toBe('header');
  });
});

describe('TenantRegistry lifecycle', () => {
  let registry: TenantRegistry;
  beforeEach(() => {
    registry = new TenantRegistry();
    registry.provision({ id: 'acme', name: 'Acme', subdomains: ['acme'], activate: true });
  });

  it('provision → active → suspended → active → purged', () => {
    registry.suspend('acme');
    expect(registry.get('acme')?.status).toBe(TenantStatus.SUSPENDED);
    expect(() => registry.requireActive('acme')).toThrow(TenantError);
    registry.activate('acme');
    expect(registry.requireActive('acme').status).toBe(TenantStatus.ACTIVE);
    registry.beginPurge('acme');
    expect(() => registry.requireActive('acme')).toThrow();
    registry.completePurge('acme');
    expect(registry.get('acme')?.status).toBe(TenantStatus.PURGED);
    expect(registry.resolveSubdomain('acme')).toBeUndefined();
    expect(registry.history('acme').length).toBeGreaterThanOrEqual(3);
  });

  it('invalid transitions throw (PURGED is terminal)', () => {
    registry.beginPurge('acme');
    registry.completePurge('acme');
    expect(() => registry.activate('acme')).toThrow(TenantError);
  });

  it('provisioning tenants are not active', () => {
    registry.provision({ id: 'newco', name: 'NewCo' });
    expect(() => registry.requireActive('newco')).toThrow(TenantError);
    registry.activate('newco');
    expect(registry.requireActive('newco').status).toBe(TenantStatus.ACTIVE);
  });

  it('duplicate id + invalid id rejected', () => {
    expect(() => registry.provision({ id: 'acme', name: 'dup' })).toThrow(TenantError);
    expect(() => registry.provision({ id: 'BAD ID!', name: 'x' })).toThrow(TenantError);
  });
});

describe('TenantScopedStore isolation', () => {
  it('scopes reads/writes to ambient tenant', () => {
    const store = new TenantScopedStore<{ name: string }>();
    TenantContext.runWith('t1', 'explicit', () => {
      store.insert({ name: 'row-a' });
      store.insert({ name: 'row-b' });
      expect(store.count()).toBe(2);
    });
    TenantContext.runWith('t2', 'explicit', () => {
      expect(store.count()).toBe(0);
      store.insert({ name: 'row-c' });
      expect(store.count()).toBe(1);
    });
    expect(store.unsafeTotalCount()).toBe(3);
  });

  it('cross-tenant access is refused (undefined + throw variants)', () => {
    const store = new TenantScopedStore<{ name: string }>();
    let id = '';
    TenantContext.runWith('t1', 'explicit', () => {
      id = store.insert({ name: 'secret' }).id as string;
    });
    TenantContext.runWith('t2', 'explicit', () => {
      expect(store.get(id)).toBeUndefined(); // invisible
      expect(() => store.getOrThrow(id)).toThrow(TenantError);
      try {
        store.getOrThrow(id);
      } catch (e) {
        expect((e as TenantError).code).toBe(TenantErrorCode.CROSS_TENANT);
      }
    });
  });

  it('operations without context throw NO_CONTEXT', () => {
    const store = new TenantScopedStore();
    expect(() => store.insert({})).toThrow(TenantError);
    expect(() => store.query()).toThrow(TenantError);
  });

  it('assertSameTenant guards direct resource access', () => {
    TenantContext.runWith('t1', 'explicit', () => {
      expect(() => assertSameTenant('t2', 'document')).toThrow(TenantError);
      expect(() => assertSameTenant('t1')).not.toThrow();
    });
  });
});

describe('SchemaPerTenantResolver', () => {
  it('produces safe qualified names + provisioning stubs', () => {
    const r = new SchemaPerTenantResolver();
    expect(r.schemaFor('acme-corp')).toBe('tenant_acme_corp');
    expect(r.qualify('acme-corp', 'orders')).toBe('tenant_acme_corp.orders');
    expect(() => r.qualify('acme', 'orders; DROP TABLE')).toThrow(TenantError);
    expect(r.provisioningStatements('x', ['orders'])[0]).toContain('CREATE SCHEMA');
  });
});

describe('TenantQuotaManager', () => {
  it('fixed window rate limit with retry-after', () => {
    const now = { t: 0 };
    const qm = new TenantQuotaManager({ requestsPerWindow: 2, windowMs: 1000 }, () => now.t);
    expect(qm.consumeRequest('t1').allowed).toBe(true);
    expect(qm.consumeRequest('t1').allowed).toBe(true);
    const denied = qm.consumeRequest('t1');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(1000);
    now.t = 1001; // window rolls
    expect(qm.consumeRequest('t1').allowed).toBe(true);
    // Different tenant unaffected.
    expect(qm.consumeRequest('t2').allowed).toBe(true);
  });

  it('concurrent ops + storage caps', () => {
    const qm = new TenantQuotaManager({ maxConcurrentOps: 1, maxStorageBytes: 100 });
    const release = qm.acquireOp('t1');
    expect(() => qm.acquireOp('t1')).toThrow(TenantError);
    release();
    expect(() => qm.acquireOp('t1')).not.toThrow();
    qm.chargeStorage('t1', 90);
    expect(() => qm.chargeStorage('t1', 20)).toThrow(TenantError);
    qm.releaseStorage('t1', 50);
    expect(() => qm.chargeStorage('t1', 60)).not.toThrow();
  });

  it('per-tenant quota override', () => {
    const qm = new TenantQuotaManager({ requestsPerWindow: 1, windowMs: 1000 });
    qm.setQuota('vip', { requestsPerWindow: 100 });
    expect(qm.consumeRequest('vip').allowed).toBe(true);
    expect(qm.consumeRequest('vip').allowed).toBe(true);
    expect(qm.consumeRequest('norm').allowed).toBe(true);
    expect(qm.consumeRequest('norm').allowed).toBe(false);
  });
});

describe('TenancyMiddleware (end-to-end)', () => {
  it('resolves → validates → scopes → runs handler', async () => {
    const { mw } = makeStack();
    mw.registry.provision({ id: 'acme', name: 'Acme', activate: true, configOverlay: { 'features.beta': true } });

    const result = await mw.handle(
      { headers: { 'x-tenant-id': 'acme' } },
      async (ctx, tenant) => {
        expect(ctx.tenantId).toBe('acme');
        expect(TenantContext.current()?.tenantId).toBe('acme'); // ambient
        return tenant.name;
      }
    );
    expect(result).toBe('Acme');
  });

  it('suspended tenant rejected', () => {
    const { mw } = makeStack();
    mw.registry.provision({ id: 'acme', name: 'Acme', activate: true });
    mw.registry.suspend('acme');
    expect(() => mw.handle({ headers: { 'x-tenant-id': 'acme' } }, () => 'x')).toThrow(TenantError);
  });

  it('unresolvable request rejected without default', () => {
    const { mw } = makeStack();
    expect(() => mw.handle({ headers: {} }, () => 'x')).toThrow(TenantError);
  });

  it('quota breach rejected with TenantError', () => {
    const now = { t: 0 };
    const { mw } = makeStack(now);
    mw.registry.provision({ id: 'acme', name: 'Acme', activate: true });
    const req = { headers: { 'x-tenant-id': 'acme' } };
    mw.handle(req, () => 1);
    mw.handle(req, () => 2);
    mw.handle(req, () => 3);
    expect(() => mw.handle(req, () => 4)).toThrow(TenantError);
  });

  it('config overlay merges over base', () => {
    const { mw } = makeStack();
    mw.registry.provision({
      id: 'acme',
      name: 'Acme',
      activate: true,
      configOverlay: { 'features.beta': true, 'limits.seats': 50 },
    });
    const cfg = mw.configFor('acme') as { features: { beta: boolean }; limits: { seats: number } };
    expect(cfg.features.beta).toBe(true);
    expect(cfg.limits.seats).toBe(50);
    const flat = mw.flatConfigFor('acme');
    expect(flat['features.beta']).toBe(true);
  });
});
