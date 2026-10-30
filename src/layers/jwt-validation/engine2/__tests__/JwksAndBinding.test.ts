/**
 * Tests for JwksCache and TokenBinding.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createHash } from 'crypto';
import { JwksCache, JwksFetcher, JwksFetchError } from '../JwksCache';
import { TokenBinding, jwkThumbprint } from '../TokenBinding';
import { ManualJwtClock2, TokenClaims2 } from '../types';
import { JsonWebKeyObject } from '../../jwt/types';

const rsa = (kid: string): JsonWebKeyObject => ({
  kty: 'RSA',
  kid,
  use: 'sig',
  alg: 'RS256',
  n: 'modulus-' + kid,
  e: 'AQAB',
});

class StubFetcher implements JwksFetcher {
  sets: JsonWebKeyObject[][] = [];
  calls = 0;
  fail = false;

  async fetch() {
    this.calls++;
    if (this.fail) throw new Error('network down');
    const keys = this.sets.shift() ?? [];
    return { keys };
  }
}

describe('JwksCache', () => {
  let clock: ManualJwtClock2;
  let fetcher: StubFetcher;
  let cache: JwksCache;

  beforeEach(() => {
    clock = new ManualJwtClock2(0);
    fetcher = new StubFetcher();
    fetcher.sets.push([rsa('k1'), rsa('k2')]);
    cache = new JwksCache(fetcher, { cacheTtlMs: 60_000, refreshCooldownMs: 10_000, clock });
  });

  it('fetches once and serves from cache within TTL', async () => {
    const r1 = await cache.resolve('k1', 'RS256');
    expect(r1?.jwk.kid).toBe('k1');
    const r2 = await cache.resolve('k2', 'RS256');
    expect(r2?.jwk.kid).toBe('k2');
    expect(fetcher.calls).toBe(1);
  });

  it('refreshes when TTL expires', async () => {
    await cache.resolve('k1');
    clock.advance(61_000);
    fetcher.sets.push([rsa('k3')]);
    const r = await cache.resolve('k3');
    expect(r?.jwk.kid).toBe('k3');
    expect(fetcher.calls).toBe(2);
  });

  it('force-refreshes on unknown kid (rotation race)', async () => {
    await cache.resolve('k1'); // prime cache
    fetcher.sets.push([rsa('k1'), rsa('k-new')]); // rotated set
    const r = await cache.resolve('k-new');
    expect(r?.jwk.kid).toBe('k-new');
    expect(r?.refreshed).toBe(true);
    expect(cache.stats.kidMisses).toBe(1);
  });

  it('rate-limits forced refreshes within cooldown', async () => {
    await cache.resolve('k1');
    fetcher.sets.push([rsa('k1'), rsa('k2')]); // refresh yields same set
    const r1 = await cache.resolve('unknown-1'); // triggers refresh
    expect(r1).toBeNull();
    fetcher.sets.push([rsa('k1'), rsa('k2'), rsa('unknown-2')]);
    const r2 = await cache.resolve('unknown-2'); // inside cooldown → no fetch
    expect(r2).toBeNull();
    expect(fetcher.calls).toBe(2);
    clock.advance(10_001);
    fetcher.sets.push([rsa('k1'), rsa('k2'), rsa('unknown-2')]);
    const r3 = await cache.resolve('unknown-2');
    expect(r3?.jwk.kid).toBe('unknown-2');
    expect(fetcher.calls).toBe(3);
  });

  it('serves stale set when refresh fails', async () => {
    await cache.resolve('k1');
    clock.advance(61_000);
    fetcher.fail = true;
    // TTL refresh failure keeps the old set — lookup still works.
    const r = await cache.resolve('k1');
    expect(r?.jwk.kid).toBe('k1');
  });

  it('throws when forced refresh fails with empty cache', async () => {
    fetcher.fail = true;
    await expect(cache.refreshNow()).rejects.toBeInstanceOf(JwksFetchError);
  });

  it('single-flights concurrent refreshes', async () => {
    let resolveFn!: (v: { keys: JsonWebKeyObject[] }) => void;
    const slowFetcher: JwksFetcher = {
      fetch: () => new Promise((r) => { resolveFn = r; }),
    };
    const slow = new JwksCache(slowFetcher, { clock });
    const p1 = slow.refreshNow();
    const p2 = slow.refreshNow();
    resolveFn({ keys: [rsa('k1')] });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b);
    expect(a.length).toBe(1);
  });

  it('falls back to sole compatible key when kid mismatches', async () => {
    const single = new StubFetcher();
    single.sets.push([rsa('only')]);
    const c = new JwksCache(single, { cacheTtlMs: 60_000, refreshCooldownMs: 60_000, clock });
    const r = await c.resolve('different-kid');
    expect(r?.jwk.kid).toBe('only');
  });
});

describe('TokenBinding / jwkThumbprint', () => {
  const jwk: JsonWebKeyObject = { kty: 'RSA', n: '0vx7agoebGc', e: 'AQAB', kid: 'x' };

  it('computes RFC 7638 thumbprints independent of extra members', () => {
    const t1 = jwkThumbprint(jwk);
    const t2 = jwkThumbprint({ ...jwk, use: 'sig', extra: 'ignored' });
    expect(t1).toBe(t2);
    expect(typeof t1).toBe('string');
  });

  it('thumbprint matches manual SHA-256 over canonical JSON', () => {
    const canonical = '{"e":"AQAB","kty":"RSA","n":"0vx7agoebGc"}';
    const expected = createHash('sha256').update(canonical).digest('base64url');
    expect(jwkThumbprint(jwk)).toBe(expected);
  });

  it('bearer tokens (no cnf) report bearer', () => {
    const tb = new TokenBinding();
    expect(tb.verify({ sub: 'u' }, {}).kind).toBe('bearer');
    expect(tb.isBound({ sub: 'u' }, {})).toBe(true);
  });

  it('verifies jkt binding against presented JWK', () => {
    const tb = new TokenBinding();
    const claims: TokenClaims2 = { cnf: { jkt: jwkThumbprint(jwk)! } };
    expect(tb.verify(claims, { jwk }).kind).toBe('bound');
    const wrong: JsonWebKeyObject = { kty: 'RSA', n: 'different', e: 'AQAB' };
    const out = tb.verify(claims, { jwk: wrong });
    expect(out.kind).toBe('mismatch');
    expect(tb.verify(claims, {}).kind).toBe('unverifiable');
  });

  it('verifies x5t#S256 against presented cert DER', () => {
    const tb = new TokenBinding();
    const der = Buffer.from('fake-der-bytes');
    const thumb = createHash('sha256').update(der).digest('base64url');
    const claims: TokenClaims2 = { cnf: { 'x5t#S256': thumb } };
    expect(tb.verify(claims, { certDer: der }).kind).toBe('bound');
    const out = tb.verify(claims, { certDer: Buffer.from('other') });
    expect(out.kind).toBe('mismatch');
  });

  it('verifies kid binding', () => {
    const tb = new TokenBinding();
    const claims: TokenClaims2 = { cnf: { kid: 'holder-key-1' } };
    expect(tb.verify(claims, { kid: 'holder-key-1' }).kind).toBe('bound');
    expect(tb.verify(claims, { kid: 'other' }).kind).toBe('mismatch');
    expect(tb.verify(claims, {}).kind).toBe('unverifiable');
  });

  it('rejects cnf with no known method', () => {
    const tb = new TokenBinding();
    expect(tb.verify({ cnf: {} }, {}).kind).toBe('unverifiable');
  });
});
