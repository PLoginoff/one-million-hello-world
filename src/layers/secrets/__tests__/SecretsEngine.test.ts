/**
 * Secrets — engine tests: versioning, rotation grace, cache, leases,
 * materialization, audit.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  SecretsEngine,
  VersionedSecretProvider,
  SecretError,
  SecretErrorCode,
} from '../vault';
import type { SecretContext } from '../vault';

const alice: SecretContext = { principal: 'alice' };

function makeEngine(nowRef: { t: number }, graceMs = 60_000): SecretsEngine {
  const provider = new VersionedSecretProvider({ clock: () => nowRef.t, gracePeriodMs: graceMs });
  return new SecretsEngine({ provider, clock: () => nowRef.t, defaultPrincipal: 'test' });
}

describe('SecretsEngine > versioning + rotation', () => {
  let now: { t: number };
  let engine: SecretsEngine;

  beforeEach(async () => {
    now = { t: 1_000_000 };
    engine = makeEngine(now);
    await engine.put('kv/db/password', 'pw-v1', alice);
  });

  it('stores and reads latest version', async () => {
    expect(await engine.get('kv/db/password', alice)).toBe('pw-v1');
  });

  it('put bumps versions and reads stay pinned', async () => {
    await engine.put('kv/db/password', 'pw-v2', alice);
    expect(await engine.get('kv/db/password')).toBe('pw-v2');
    expect(await engine.getVersion('kv/db/password', 1)).toBe('pw-v1');
    expect(await engine.versions('kv/db/password')).toEqual([1, 2]);
  });

  it('superseded versions expire after the grace window', async () => {
    await engine.put('kv/db/password', 'pw-v2', alice);
    now.t += 59_000; // inside 60s grace
    expect(await engine.getVersion('kv/db/password', 1)).toBe('pw-v1');
    now.t += 2_000; // past grace
    await expect(engine.getVersion('kv/db/password', 1)).rejects.toThrow(SecretError);
  });

  it('rotate reports previous + new version', async () => {
    const r = await engine.rotate('kv/db/password', 'pw-v2', alice);
    expect(r.previousVersion).toBe(1);
    expect(r.newVersion).toBe(2);
    expect(await engine.get('kv/db/password')).toBe('pw-v2');
  });

  it('read of missing secret throws NOT_FOUND', async () => {
    await expect(engine.get('kv/nope')).rejects.toMatchObject({ code: SecretErrorCode.NOT_FOUND });
  });

  it('wildcard + prefix listing', async () => {
    await engine.put('kv/db/user', 'u');
    await engine.put('kv/api/key', 'k');
    await engine.put('other/x', 'x');
    expect(await engine.list('kv/')).toEqual(['kv/api/key', 'kv/db/password', 'kv/db/user']);
    expect(await engine.list('kv/*/password')).toEqual(['kv/db/password']);
    expect(await engine.list('**')).toEqual(['kv/api/key', 'kv/db/password', 'kv/db/user', 'other/x']);
  });
});

describe('SecretsEngine > cache', () => {
  it('serves repeated reads from cache and invalidates on write', async () => {
    const now = { t: 0 };
    const provider = new VersionedSecretProvider({ clock: () => now.t });
    let backendReads = 0;
    const counting = new Proxy(provider, {
      get(target, prop) {
        const v = Reflect.get(target, prop);
        if (prop === 'get' && typeof v === 'function') {
          return async (...args: unknown[]) => {
            backendReads++;
            return (v as (p: string) => Promise<unknown>).apply(target, args);
          };
        }
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const engine = new SecretsEngine({ provider: counting, clock: () => now.t, cacheTtlMs: 10_000 });
    await engine.put('kv/x', 'v1');
    backendReads = 0;
    await engine.get('kv/x');
    await engine.get('kv/x');
    expect(backendReads).toBe(1);
    expect(engine.cacheStats()?.hits).toBe(1);

    await engine.put('kv/x', 'v2'); // invalidates
    await engine.get('kv/x');
    expect(backendReads).toBe(2);
  });

  it('negative caching shields backend from hot misses', async () => {
    const now = { t: 0 };
    const provider = new VersionedSecretProvider({ clock: () => now.t });
    let backendReads = 0;
    const orig = provider.get.bind(provider);
    provider.get = async (p: string) => {
      backendReads++;
      return orig(p);
    };
    const engine = new SecretsEngine({ provider, clock: () => now.t, negativeCacheTtlMs: 5_000 });
    await engine.tryGet('kv/miss');
    await engine.tryGet('kv/miss');
    expect(backendReads).toBe(1);
    now.t += 6_000; // negative TTL lapses
    await engine.tryGet('kv/miss');
    expect(backendReads).toBe(2);
  });
});

describe('SecretsEngine > leases', () => {
  it('issues, renews, caps at maxTtl and expires', () => {
    const now = { t: 0 };
    const engine = makeEngine(now);
    const lease = engine.issueLease('db/creds', 1_000, alice, 5_000);
    expect(lease.expiresAt).toBe(1_000);

    const renewed = engine.renewLease(lease.leaseId, 2_000, alice);
    expect(renewed.expiresAt).toBe(3_000);
    const capped = engine.renewLease(lease.leaseId, 99_000, alice);
    expect(capped.expiresAt).toBe(5_000); // maxExpiresAt cap

    now.t = 5_001;
    expect(() => engine.leases.read(lease.leaseId)).toThrow(SecretError);
  });

  it('non-renewable leases reject renew', () => {
    const now = { t: 0 };
    const engine = makeEngine(now);
    const lease = engine.leases.issue('one-shot', { ttlMs: 1_000, renewable: false });
    expect(() => engine.renewLease(lease.leaseId, 100)).toThrow(SecretError);
  });

  it('revocation kills the lease and audit-records it', () => {
    const now = { t: 0 };
    const engine = makeEngine(now);
    const lease = engine.issueLease('db/creds', 10_000, alice);
    engine.revokeLease(lease.leaseId, alice);
    expect(() => engine.leases.read(lease.leaseId)).toThrow();
    const entries = engine.audit({ actions: ['lease-revoke'] });
    expect(entries.length).toBe(1);
  });
});

describe('SecretsEngine > materialization', () => {
  it('expands ${secret:path} and ${secret:path@version}', async () => {
    const now = { t: 0 };
    const engine = makeEngine(now);
    await engine.put('db/password', 's3cret');
    await engine.put('db/password', 's3cret-v2');
    const out = await engine.materialize('postgres://u:${secret:db/password}@h/db', alice);
    expect(out).toBe('postgres://u:s3cret-v2@h/db');
    const pinned = await engine.materialize('pw=${secret:db/password@1}');
    expect(pinned).toBe('pw=s3cret');
  });

  it('leaves unresolvable refs in place', async () => {
    const now = { t: 0 };
    const engine = makeEngine(now);
    const out = await engine.materialize('x=${secret:nope/missing}');
    expect(out).toBe('x=${secret:nope/missing}');
  });
});

describe('SecretsEngine > audit', () => {
  it('records reads/writes/deletes with principal and outcome', async () => {
    const now = { t: 0 };
    const engine = makeEngine(now);
    await engine.put('k', 'v', alice);
    await engine.get('k', alice);
    await engine.tryGet('missing', alice);
    await engine.delete('k', alice);

    const entries = engine.audit({ principal: 'alice' });
    const actions = entries.map((e) => `${e.action}:${e.success}`);
    expect(actions).toContain('write:true');
    expect(actions).toContain('read:true');
    expect(actions).toContain('read:false');
    expect(actions).toContain('delete:true');
    // Sequence numbers are gapless.
    expect(engine.auditLog.gaps()).toBe(0);
  });

  it('audit entries never contain secret values', async () => {
    const now = { t: 0 };
    const engine = makeEngine(now);
    await engine.put('k', 'SUPER-SECRET-VALUE', alice);
    await engine.get('k', alice);
    for (const e of engine.audit()) {
      expect(e.detail ?? '').not.toContain('SUPER-SECRET-VALUE');
    }
  });
});
