/**
 * Tests for ScopeAuthorizer, IntrospectionClient, ValidatingClient.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ScopeAuthorizer, tokenScopes, scopeSatisfies } from '../ScopeAuthorizer';
import { IntrospectionClient, IntrospectionTransport, IntrospectionResult2 } from '../IntrospectionClient';
import { ValidatingClient } from '../ValidatingClient';
import { JwksCache } from '../JwksCache';
import { ManualJwtClock2, TokenClaims2 } from '../types';

describe('tokenScopes / scopeSatisfies', () => {
  it('parses space-delimited scope strings', () => {
    expect([...tokenScopes({ scope: 'read write  admin' })]).toEqual(['read', 'write', 'admin']);
  });

  it('parses scp arrays and strings', () => {
    expect([...tokenScopes({ scp: ['a', 'b'] })]).toEqual(['a', 'b']);
    expect([...tokenScopes({ scp: 'a b' })].sort()).toEqual(['a', 'b']);
  });

  it('merges scope and scp', () => {
    expect([...tokenScopes({ scope: 'x', scp: ['y'] })].sort()).toEqual(['x', 'y']);
  });

  it('wildcard scopes satisfy prefix requirements', () => {
    expect(scopeSatisfies('orders:*', 'orders:read')).toBe(true);
    expect(scopeSatisfies('orders:*', 'orders:write')).toBe(true);
    expect(scopeSatisfies('orders:*', 'users:read')).toBe(false);
    expect(scopeSatisfies('*', 'anything')).toBe(true);
    expect(scopeSatisfies('orders:read', 'orders:read')).toBe(true);
    expect(scopeSatisfies('orders:read', 'orders:write')).toBe(false);
  });
});

describe('ScopeAuthorizer', () => {
  const policy = {
    'read:orders': ['orders:read', 'orders:*'],
    'write:orders': ['orders:write', 'orders:*'],
    'admin:panel': ['admin'],
  };
  const authz = new ScopeAuthorizer(policy);

  it('grants when a matching scope is present', () => {
    const claims: TokenClaims2 = { scope: 'orders:read audit:log' };
    const d = authz.authorize(claims, 'read:orders');
    expect(d.allowed).toBe(true);
    expect(d.grantedBy).toEqual(['orders:read']);
  });

  it('denies with missing scopes listed', () => {
    const d = authz.authorize({ scope: 'orders:read' }, 'write:orders');
    expect(d.allowed).toBe(false);
    expect(d.missing).toEqual(['orders:write', 'orders:*']);
  });

  it('wildcard scope satisfies concrete requirements', () => {
    const claims: TokenClaims2 = { scope: 'orders:*' };
    expect(authz.can(claims, 'read:orders')).toBe(true);
    expect(authz.can(claims, 'write:orders')).toBe(true);
  });

  it('unknown permissions deny closed-world', () => {
    expect(authz.can({ scope: '*' }, 'nuke:everything')).toBe(false);
  });

  it('canAll / canAny compose permissions', () => {
    const claims: TokenClaims2 = { scope: 'orders:read admin' };
    expect(authz.canAll(claims, ['read:orders', 'admin:panel']).allowed).toBe(true);
    expect(authz.canAll(claims, ['read:orders', 'write:orders']).allowed).toBe(false);
    expect(authz.canAny(claims, ['write:orders', 'admin:panel']).allowed).toBe(true);
    expect(authz.canAny(claims, ['write:orders', 'nope']).allowed).toBe(false);
  });

  it('permitted lists all grantable permissions', () => {
    const claims: TokenClaims2 = { scope: 'orders:*' };
    expect(authz.permitted(claims).sort()).toEqual(['read:orders', 'write:orders']);
  });
});

describe('IntrospectionClient', () => {
  let clock: ManualJwtClock2;
  let transport: { calls: number; results: IntrospectionResult2[]; fail: boolean } & IntrospectionTransport;
  let client: IntrospectionClient;

  beforeEach(() => {
    clock = new ManualJwtClock2(1_000_000);
    transport = {
      calls: 0,
      results: [],
      fail: false,
      async post() {
        this.calls++;
        if (this.fail) throw new Error('endpoint down');
        return this.results.shift() ?? { active: false };
      },
    };
    client = new IntrospectionClient(transport, {
      cacheTtlMs: 60_000,
      negativeTtlMs: 5_000,
      clock,
    });
  });

  const futureExp = () => Math.floor((clock.now() + 300_000) / 1000);

  it('returns active responses and caches them', async () => {
    transport.results.push({ active: true, sub: 'u1', exp: futureExp() });
    const r = await client.introspect('tok');
    expect(r.active).toBe(true);
    const r2 = await client.introspect('tok');
    expect(transport.calls).toBe(1);
    expect(r2).toBe(r);
  });

  it('caps active cache at token exp', async () => {
    transport.results.push({ active: true, exp: Math.floor((clock.now() + 2_000) / 1000) });
    await client.introspect('tok');
    clock.advance(3_000); // past exp → expired entry, refetch
    transport.results.push({ active: false });
    const r = await client.introspect('tok');
    expect(r.active).toBe(false);
    expect(transport.calls).toBe(2);
  });

  it('negative results cache briefly', async () => {
    const r = await client.introspect('revoked');
    expect(r.active).toBe(false);
    await client.introspect('revoked');
    expect(transport.calls).toBe(1);
    clock.advance(5_001);
    await client.introspect('revoked');
    expect(transport.calls).toBe(2);
  });

  it('isActive convenience', async () => {
    transport.results.push({ active: true, exp: futureExp() });
    expect(await client.isActive('t')).toBe(true);
  });

  it('sweep removes expired entries', async () => {
    transport.results.push({ active: false });
    await client.introspect('x');
    clock.advance(10_000);
    expect(client.sweep()).toBe(1);
  });
});

describe('ValidatingClient', () => {
  it('localCheck fails fast on binding mismatch', async () => {
    const clock = new ManualJwtClock2(0);
    const jwks = new JwksCache({ fetch: async () => ({ keys: [] }) }, { clock });
    const authz = new ScopeAuthorizer({ p: ['s'] });
    const vc = new ValidatingClient({ jwks, authorizer: authz });

    const claims: TokenClaims2 = { scope: 's', cnf: { kid: 'expected' } };
    const out = vc.localCheck(claims, { kid: 'wrong' }, 'p');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.stage).toBe('binding');
  });

  it('localCheck fails on missing scope', async () => {
    const clock = new ManualJwtClock2(0);
    const jwks = new JwksCache({ fetch: async () => ({ keys: [] }) }, { clock });
    const authz = new ScopeAuthorizer({ p: ['needed'] });
    const vc = new ValidatingClient({ jwks, authorizer: authz });
    const out = vc.localCheck({ scope: 'other' }, {}, 'p');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.stage).toBe('scope');
  });

  it('fullCheck runs introspection only after local checks pass', async () => {
    const clock = new ManualJwtClock2(0);
    const jwks = new JwksCache({ fetch: async () => ({ keys: [] }) }, { clock });
    const authz = new ScopeAuthorizer({ p: ['s'] });
    let calls = 0;
    const intro = new IntrospectionClient(
      {
        post: async () => {
          calls++;
          return { active: true };
        },
      },
      { clock }
    );
    const vc = new ValidatingClient({ jwks, authorizer: authz, introspector: intro });

    // Local check fails → no introspection call.
    const denied = await vc.fullCheck('tok', { scope: 'none' }, {}, 'p');
    expect(denied.ok).toBe(false);
    expect(calls).toBe(0);

    // Local passes → introspection runs.
    const ok = await vc.fullCheck('tok', { scope: 's' }, {}, 'p');
    expect(ok.ok).toBe(true);
    expect(calls).toBe(1);
  });
});
