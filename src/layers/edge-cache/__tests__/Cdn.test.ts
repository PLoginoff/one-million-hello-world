/**
 * CDN edge-cache tests — key normalization, Cache-Control parsing,
 * TTL negotiation, Vary, SWR/SIE, coalescing, purge, negative caching,
 * per-region stats.
 */

import { describe, it, expect } from 'bun:test';
import { EdgeCacheEngine } from '../cdn/EdgeCacheEngine';
import { baseKey, parseUrl, normalizePath, varyKey } from '../cdn/CacheKey';
import { parseCacheControl, negotiateTtl, freshness, Freshness } from '../cdn/CacheControl';
import { EdgeRequest, EdgeResponse, CacheDisposition, CacheMetadata } from '../cdn/types';

function get(url: string, headers: Record<string, string> = {}, region?: string): EdgeRequest {
  return { method: 'GET', url, headers, region };
}

function ok(body: string, headers: Record<string, string> = {}, status = 200): EdgeResponse {
  return { status, headers, body };
}

describe('CacheKey normalization', () => {
  it('sorts query params and drops tracking params', () => {
    expect(baseKey('/a?b=2&a=1&utm_source=x')).toBe('/a?a=1&b=2');
    expect(baseKey('/a?z=1&y=2&x=3')).toBe('/a?x=3&y=2&z=1');
  });

  it('normalizes paths: dot segments, dup slashes, trailing slash', () => {
    expect(normalizePath('/a//b/./c/../d/')).toBe('/a/b/d');
    expect(baseKey('/a//b')).toBe('/a/b');
  });

  it('parses bare flags and key=value params', () => {
    const a = parseUrl('/x?flag');
    expect(a.queryPairs).toEqual([['flag', '']]);
    // Bare flag and empty value normalize identically (CDN-standard).
    expect(baseKey('/x?flag')).toBe(baseKey('/x?flag='));
  });

  it('varyKey normalizes header value lists', () => {
    expect(varyKey(['Accept-Encoding'], { 'accept-encoding': 'br, gzip' }))
      .toBe(varyKey(['accept-encoding'], { 'accept-encoding': 'gzip,br' }));
  });
});

describe('Cache-Control parsing', () => {
  it('parses all standard directives', () => {
    const cc = parseCacheControl('public, max-age=60, s-maxage=30, stale-while-revalidate=15, stale-if-error=300, immutable');
    expect(cc.maxAge).toBe(60);
    expect(cc.sMaxAge).toBe(30);
    expect(cc.staleWhileRevalidate).toBe(15);
    expect(cc.staleIfError).toBe(300);
    expect(cc.public_).toBe(true);
    expect(cc.immutable).toBe(true);
  });

  it('s-maxage wins over max-age for shared caches', () => {
    const ttl = negotiateTtl(
      ok('x', { 'cache-control': 'max-age=60, s-maxage=30' }),
      { honorSMaxage: true, defaultTtlSeconds: 10 }
    );
    expect(ttl).toBe(30);
  });

  it('Expires header used when no max-age', () => {
    const now = Date.now();
    const ttl = negotiateTtl(
      ok('x', { expires: new Date(now + 45_000).toUTCString() }),
      { honorSMaxage: true, defaultTtlSeconds: 10, now }
    );
    expect(ttl).toBeGreaterThanOrEqual(44);
    expect(ttl).toBeLessThanOrEqual(45);
  });

  it('heuristic freshness: 10% of last-modified age', () => {
    const now = Date.now();
    const ttl = negotiateTtl(
      ok('x', { 'last-modified': new Date(now - 100_000).toUTCString() }),
      { honorSMaxage: true, defaultTtlSeconds: 10, now }
    );
    expect(ttl).toBe(10);
  });

  it('no-store / private responses are uncacheable', () => {
    expect(negotiateTtl(ok('x', { 'cache-control': 'no-store' }), { honorSMaxage: true, defaultTtlSeconds: 10 })).toBeUndefined();
    expect(negotiateTtl(ok('x', { 'cache-control': 'private' }), { honorSMaxage: true, defaultTtlSeconds: 10 })).toBeUndefined();
  });

  it('freshness classification windows', () => {
    const meta: CacheMetadata = {
      ttlSeconds: 10, storedAt: 0, freshUntil: 10_000, swrUntil: 15_000, sieUntil: 60_000,
      validators: {}, vary: [], tags: [], originStatus: 200,
    };
    expect(freshness(meta, 5_000)).toBe(Freshness.FRESH);
    expect(freshness(meta, 12_000)).toBe(Freshness.STALE_SWR);
    expect(freshness(meta, 30_000)).toBe(Freshness.STALE_SIE);
    expect(freshness(meta, 61_000)).toBe(Freshness.EXPIRED);
  });
});

describe('EdgeCacheEngine', () => {
  it('caches a miss then serves a hit with Age', async () => {
    let now = 1_000_000;
    const engine = new EdgeCacheEngine({}, () => now);
    const origin = () => Promise.resolve(ok('hello', { 'cache-control': 'max-age=60' }));

    const r1 = await engine.fetch(get('/a'), origin);
    expect(r1.disposition).toBe(CacheDisposition.MISS);
    now += 5_000;
    const r2 = await engine.fetch(get('/a'), () => Promise.reject(new Error('should not hit origin')));
    expect(r2.disposition).toBe(CacheDisposition.HIT);
    expect(r2.age).toBe(5);
    expect(r2.response.headers['age']).toBe('5');
  });

  it('query order + tracking params share entries', async () => {
    const engine = new EdgeCacheEngine({});
    let calls = 0;
    const origin = () => { calls++; return Promise.resolve(ok('x', { 'cache-control': 'max-age=60' })); };
    await engine.fetch(get('/p?a=1&b=2&utm_source=n'), origin);
    const r = await engine.fetch(get('/p?utm_campaign=q&b=2&a=1'), origin);
    expect(r.disposition).toBe(CacheDisposition.HIT);
    expect(calls).toBe(1);
  });

  it('Vary splits variants per header value', async () => {
    const engine = new EdgeCacheEngine({});
    const origin = (req: EdgeRequest) =>
      Promise.resolve(ok(`enc:${req.headers['accept-encoding'] ?? 'none'}`, {
        'cache-control': 'max-age=60', vary: 'Accept-Encoding',
      }));
    const r1 = await engine.fetch(get('/v', { 'accept-encoding': 'br' }), origin);
    const r2 = await engine.fetch(get('/v', { 'accept-encoding': 'gzip' }), origin);
    const r3 = await engine.fetch(get('/v', { 'accept-encoding': 'br' }), origin);
    expect(r1.response.body).toBe('enc:br');
    expect(r2.response.body).toBe('enc:gzip');
    expect(r3.disposition).toBe(CacheDisposition.HIT);
    expect(r3.response.body).toBe('enc:br');
  });

  it('conditional revalidation: 304 refreshes TTL', async () => {
    let now = 1_000_000;
    const engine = new EdgeCacheEngine({}, () => now);
    let calls = 0;
    const origin = (req: EdgeRequest) => {
      calls++;
      if (req.headers['if-none-match'] === '"v1"') {
        return Promise.resolve(ok('', { 'cache-control': 'max-age=60' }, 304));
      }
      return Promise.resolve(ok('v1-body', { 'cache-control': 'max-age=10', etag: '"v1"' }));
    };
    await engine.fetch(get('/r'), origin);
    now += 11_000; // stale
    const r = await engine.fetch(get('/r'), origin);
    expect(r.disposition).toBe(CacheDisposition.REVALIDATED);
    expect(r.revalidated304).toBe(true);
    expect(r.response.body).toBe('v1-body');
    expect(calls).toBe(2);
    now += 5_000;
    const r2 = await engine.fetch(get('/r'), origin);
    expect(r2.disposition).toBe(CacheDisposition.HIT); // TTL refreshed by 304
  });

  it('stale-while-revalidate serves stale and revalidates in background', async () => {
    let now = 1_000_000;
    const engine = new EdgeCacheEngine({}, () => now);
    let calls = 0;
    const origin = (req: EdgeRequest) => {
      calls++;
      if (req.headers['if-none-match']) {
        return Promise.resolve(ok('', { 'cache-control': 'max-age=10' }, 304));
      }
      return Promise.resolve(ok('body', { 'cache-control': 'max-age=10, stale-while-revalidate=30', etag: '"e"' }));
    };
    await engine.fetch(get('/swr'), origin);
    now += 15_000; // inside SWR window
    const r = await engine.fetch(get('/swr'), origin);
    expect(r.disposition).toBe(CacheDisposition.STALE_REVALIDATE);
    // background revalidation completes
    await new Promise((res) => setTimeout(res, 5));
    expect(calls).toBe(2);
    now += 1_000;
    const r2 = await engine.fetch(get('/swr'), origin);
    expect(r2.disposition).toBe(CacheDisposition.HIT);
  });

  it('stale-if-error serves stale on origin failure', async () => {
    let now = 1_000_000;
    const engine = new EdgeCacheEngine({}, () => now);
    const origin = () => Promise.resolve(ok('body', { 'cache-control': 'max-age=10, stale-if-error=300', etag: '"e"' }));
    await engine.fetch(get('/sie'), origin);
    now += 50_000; // past SIE? no: SIE window = 10 + 300 s
    const failing = () => Promise.reject(new Error('origin down'));
    const r = await engine.fetch(get('/sie'), failing);
    expect(r.disposition).toBe(CacheDisposition.STALE_IF_ERROR);
    expect(r.response.body).toBe('body');
  });

  it('expired + no SIE propagates origin error', async () => {
    let now = 1_000_000;
    const engine = new EdgeCacheEngine({}, () => now);
    await engine.fetch(get('/e'), () => Promise.resolve(ok('b', { 'cache-control': 'max-age=10' })));
    now += 20_000;
    await expect(engine.fetch(get('/e'), () => Promise.reject(new Error('down')))).rejects.toThrow('origin fetch failed');
  });

  it('coalesces concurrent misses onto one origin fetch', async () => {
    const engine = new EdgeCacheEngine({ coalesceRequests: true });
    let calls = 0;
    const origin = () => {
      calls++;
      return new Promise<EdgeResponse>((res) => setTimeout(() => res(ok('x', { 'cache-control': 'max-age=60' })), 10));
    };
    const [a, b, c] = await Promise.all([
      engine.fetch(get('/coal'), origin),
      engine.fetch(get('/coal'), origin),
      engine.fetch(get('/coal'), origin),
    ]);
    expect(calls).toBe(1);
    expect(a.response.body).toBe('x');
    expect(b.disposition).toBe(CacheDisposition.MISS);
    void c;
    expect(engine.stats()['default'].coalesced).toBe(2);
  });

  it('negative caching absorbs 404 storms', async () => {
    const engine = new EdgeCacheEngine({ negativeTtlSeconds: 30 });
    let calls = 0;
    const origin = () => { calls++; return Promise.resolve({ status: 404, headers: {}, body: 'not found' }); };
    await engine.fetch(get('/missing'), origin);
    const r = await engine.fetch(get('/missing'), origin);
    expect(calls).toBe(1);
    expect(r.disposition).toBe(CacheDisposition.HIT);
    expect(r.response.status).toBe(404);
  });

  it('purge by tag, prefix, key, and all', async () => {
    const engine = new EdgeCacheEngine({});
    const origin = () => Promise.resolve(ok('x', { 'cache-control': 'max-age=60' }));
    await engine.fetch(get('/a/1'), origin, { tags: ['article'] });
    await engine.fetch(get('/a/2'), origin, { tags: ['article'] });
    await engine.fetch(get('/b/1'), origin, { tags: ['blog'] });
    expect(engine.size()).toBe(3);
    expect(engine.purge({ kind: 'tag', tag: 'article' })).toBe(2);
    expect(engine.size()).toBe(1);
    await engine.fetch(get('/a/3'), origin);
    expect(engine.purge({ kind: 'prefix', prefix: '/a' })).toBe(1);
    expect(engine.purge({ kind: 'key', key: '/b/1' })).toBe(1);
    await engine.fetch(get('/z'), origin);
    expect(engine.purge({ kind: 'all' })).toBeGreaterThanOrEqual(1);
    expect(engine.size()).toBe(0);
  });

  it('non-GET bypasses and purges the key', async () => {
    const engine = new EdgeCacheEngine({});
    const origin = () => Promise.resolve(ok('x', { 'cache-control': 'max-age=60' }));
    await engine.fetch(get('/w'), origin);
    expect(engine.size()).toBe(1);
    const r = await engine.fetch({ method: 'POST', url: '/w', headers: {} }, origin);
    expect(r.disposition).toBe(CacheDisposition.BYPASS);
    expect(engine.size()).toBe(0);
  });

  it('per-region stats tracked separately', async () => {
    const engine = new EdgeCacheEngine({});
    const origin = () => Promise.resolve(ok('x', { 'cache-control': 'max-age=60' }));
    await engine.fetch(get('/s', {}, 'us-east'), origin); // miss
    await engine.fetch(get('/s', {}, 'us-east'), origin); // hit (shared store)
    await engine.fetch(get('/t', {}, 'eu-west'), origin); // miss
    await engine.fetch(get('/s', {}, 'eu-west'), origin); // hit — shared cache across regions
    const stats = engine.stats();
    expect(stats['us-east'].hits).toBe(1);
    expect(stats['us-east'].misses).toBe(1);
    expect(stats['eu-west'].misses).toBe(1);
    expect(stats['eu-west'].hits).toBe(1);
  });

  it('LRU eviction at capacity', async () => {
    const engine = new EdgeCacheEngine({ capacity: 3 });
    const origin = () => Promise.resolve(ok('x', { 'cache-control': 'max-age=600' }));
    await engine.fetch(get('/1'), origin);
    await engine.fetch(get('/2'), origin);
    await engine.fetch(get('/3'), origin);
    // touch /1 so /2 becomes LRU
    await engine.fetch(get('/1'), origin);
    await engine.fetch(get('/4'), origin);
    expect(engine.size()).toBe(3);
    let calls = 0;
    const counting = () => { calls++; return Promise.resolve(ok('y', { 'cache-control': 'max-age=600' })); };
    const r = await engine.fetch(get('/2'), counting);
    expect(r.disposition).toBe(CacheDisposition.MISS); // evicted
    expect(calls).toBe(1);
  });

  it('request no-cache forces revalidation', async () => {
    const engine = new EdgeCacheEngine({});
    let calls = 0;
    const origin = () => { calls++; return Promise.resolve(ok('x', { 'cache-control': 'max-age=600' })); };
    await engine.fetch(get('/nc'), origin);
    const r = await engine.fetch(get('/nc', { 'cache-control': 'no-cache' }), origin);
    expect(r.disposition).not.toBe(CacheDisposition.HIT);
    expect(calls).toBe(2);
  });
});
