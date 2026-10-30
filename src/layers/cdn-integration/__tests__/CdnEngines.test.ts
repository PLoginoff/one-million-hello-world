/**
 * CDN-integration engines — cache keys, TTL, signed URLs, rate limits,
 * purge dedup/wildcard, origin shielding, batching, weighted routing.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  CacheControl,
  CacheKeyGenerator,
  CacheStatus,
  CdnRouter,
  InvalidationBatcher,
  OriginShield,
  PurgeEngine,
  PurgeKind,
  SignedUrl,
  TestClock,
  TokenBucket,
  fnv1a,
  normalizePath,
  wildcardToRegex,
} from '../engines';

// ---------------------------------------------------------------------------
// CacheKey
// ---------------------------------------------------------------------------

describe('CacheKeyGenerator', () => {
  const gen = new CacheKeyGenerator();

  it('normalizes equivalent URLs to the same key', () => {
    const a = gen.key('HTTPS://EXAMPLE.COM:443/a/b?x=1&utm_source=nl&y=2');
    const b = gen.key('https://example.com/a/b?y=2&x=1');
    expect(a).toBe(b);
  });

  it('strips default ports only', () => {
    expect(gen.key('http://h.com:80/a')).toBe('http://h.com/a');
    expect(gen.key('http://h.com:8080/a')).toBe('http://h.com:8080/a');
  });

  it('drops fragments and sorts params', () => {
    const k = gen.generate('https://x.com/p?b=2&a=1#frag');
    expect(k.params.map(([n]) => n)).toEqual(['a', 'b']);
    expect(k.key).not.toContain('frag');
  });

  it('allowedParams allowlist wins over ignoredParams', () => {
    const g = new CacheKeyGenerator({ allowedParams: ['id'] });
    expect(g.key('https://x.com/p?id=1&utm_source=x&z=9')).toBe('https://x.com/p?id=1');
  });

  it('vary headers fold into the key', () => {
    const g = new CacheKeyGenerator({ varyHeaders: ['Accept-Encoding'] });
    const a = g.key('https://x.com/p', { 'accept-encoding': 'gzip' });
    const b = g.key('https://x.com/p', { 'accept-encoding': 'br' });
    expect(a).not.toBe(b);
    expect(a).toContain('accept-encoding=gzip');
  });

  it('normalizePath resolves dot segments', () => {
    expect(normalizePath('/a/./b/../c/')).toBe('/a/c/');
    expect(normalizePath('//a//b')).toBe('/a/b');
    expect(normalizePath('')).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// CacheControl / TTL / status
// ---------------------------------------------------------------------------

describe('CacheControl', () => {
  const clock = new TestClock(1_000_000_000);
  const cc = new CacheControl(clock);

  it('parses directives including extensions and quotes', () => {
    const d = CacheControl.parse('public, max-age=60, s-maxage=30, x-custom="v1"');
    expect(d.public).toBe(true);
    expect(d.maxAge).toBe(60);
    expect(d.sMaxAge).toBe(30);
    expect(d.extensions['x-custom']).toBe('v1');
  });

  it('s-maxage beats max-age; no-store wins overall', () => {
    expect(cc.computeTtl({ 'cache-control': 'max-age=100, s-maxage=30' }).ttlSeconds).toBe(30);
    const t = cc.computeTtl({ 'cache-control': 'no-store, max-age=999' });
    expect(t.cacheable).toBe(false);
    expect(t.ttlSeconds).toBe(0);
  });

  it('Expires header computes delta vs Date/now', () => {
    const now = clock.now();
    const expires = new Date(now + 60_000).toUTCString();
    const date = new Date(now).toUTCString();
    expect(cc.computeTtl({ expires, date }).ttlSeconds).toBe(60);
  });

  it('heuristic TTL is 10% of age since Last-Modified, capped', () => {
    const lm = new Date(clock.now() - 100_000_000).toUTCString(); // ~27.7h ago
    const t = cc.computeTtl({ 'last-modified': lm }, 300);
    expect(t.reason).toContain('heuristic');
    expect(t.ttlSeconds).toBe(300); // capped at default
  });

  it('stale-while-revalidate widows reported', () => {
    const t = cc.computeTtl({ 'cache-control': 'max-age=60, stale-while-revalidate=30' });
    expect(t.staleWhileRevalidate).toBe(30);
  });

  it('parses CF-Cache-Status directly', () => {
    expect(cc.parseStatus({ 'cf-cache-status': 'HIT' }).status).toBe(CacheStatus.Hit);
    expect(cc.parseStatus({ 'cf-cache-status': 'REVALIDATED' }).status).toBe(CacheStatus.Stale);
  });

  it('parses X-Cache MISS / HIT variants', () => {
    expect(cc.parseStatus({ 'x-cache': 'Miss from cloudfront' }).status).toBe(CacheStatus.Miss);
    expect(cc.parseStatus({ 'x-cache': 'Hit from cloudfront' }).status).toBe(CacheStatus.Hit);
  });

  it('derives status from Age when no status header', () => {
    const h = { 'cache-control': 'max-age=60', age: '30' };
    expect(cc.parseStatus(h).status).toBe(CacheStatus.Hit);
    expect(cc.parseStatus({ 'cache-control': 'max-age=60', age: '90' }).status).toBe(
      CacheStatus.Expired
    );
    const stale = { 'cache-control': 'max-age=60, stale-while-revalidate=60', age: '90' };
    expect(cc.parseStatus(stale).status).toBe(CacheStatus.Stale);
  });
});

// ---------------------------------------------------------------------------
// SignedUrl
// ---------------------------------------------------------------------------

describe('SignedUrl', () => {
  const clock = new TestClock(1_000_000);
  const signer = new SignedUrl('s3cret', clock);

  it('signs and verifies', () => {
    const url = signer.sign('https://cdn.example.com/img/a.png', {
      expires: clock.now() + 60_000,
    });
    expect(signer.verify(url).ok).toBe(true);
  });

  it('expires', () => {
    const url = signer.sign('https://cdn.example.com/a', { expires: clock.now() + 1000 });
    clock.advance(2000);
    expect(signer.verify(url).reason).toBe('expired');
  });

  it('binds IP', () => {
    const url = signer.sign('https://cdn.example.com/a', {
      expires: clock.now() + 1000,
      ip: '1.2.3.4',
    });
    expect(signer.verify(url, '1.2.3.4').ok).toBe(true);
    expect(signer.verify(url, '9.9.9.9').reason).toBe('ip_mismatch');
  });

  it('binds method', () => {
    const url = signer.sign('https://cdn.example.com/a', {
      expires: clock.now() + 1000,
      method: 'GET',
    });
    expect(signer.verify(url, undefined, 'POST').reason).toBe('method_mismatch');
  });

  it('rejects tampered URLs', () => {
    const url = signer.sign('https://cdn.example.com/a?x=1', {
      expires: clock.now() + 1000,
    });
    const tampered = url.replace('a?', 'b?');
    expect(signer.verify(tampered).reason).toBe('bad_signature');
  });

  it('policy signature covers a path prefix', () => {
    const p = signer.signPolicy('https://cdn.example.com/media/', '/media/', clock.now() + 5000);
    const verify = (path: string) =>
      signer.verifyPolicy(`https://cdn.example.com${path}?` + p.split('?')[1]);
    expect(verify('/media/a.png').ok).toBe(true);
    expect(verify('/media/sub/b.png').ok).toBe(true);
    expect(verify('/other/c.png').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TokenBucket
// ---------------------------------------------------------------------------

describe('TokenBucket', () => {
  it('refills over time and reports retryAfter', () => {
    const clock = new TestClock(0);
    const b = new TokenBucket({ refillRatePerSec: 10, burst: 5 }, clock);
    for (let i = 0; i < 5; i++) expect(b.tryAcquire().ok).toBe(true);
    const fail = b.tryAcquire();
    expect(fail.ok).toBe(false);
    if (!fail.ok) expect(fail.retryAfterMs).toBe(100); // 1 token at 10/s
    clock.advance(500);
    expect(b.tryAcquire().ok).toBe(true); // 5 tokens refilled
  });
});

// ---------------------------------------------------------------------------
// PurgeEngine
// ---------------------------------------------------------------------------

describe('PurgeEngine', () => {
  let clock: TestClock;
  let engine: PurgeEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    engine = new PurgeEngine({ clock, dedupWindowMs: 10_000 });
  });

  it('accepts and assigns purge ids', () => {
    const r = engine.purge({ kind: PurgeKind.Url, value: 'https://x.com/a.png' });
    expect(r.status).toBe('accepted');
    expect(r.purgeId).toBe('purge-1');
  });

  it('dedups identical purges inside the window', () => {
    engine.purge({ kind: PurgeKind.Url, value: 'https://x.com/a.png?utm_source=z' });
    const dup = engine.purge({ kind: PurgeKind.Url, value: 'https://x.com/a.png' });
    expect(dup.status).toBe('duplicate');
    expect(dup.purgeId).toBe('purge-1');
  });

  it('dedup expires after the window', () => {
    engine.purge({ kind: PurgeKind.Url, value: 'https://x.com/a.png' });
    clock.advance(11_000);
    const r = engine.purge({ kind: PurgeKind.Url, value: 'https://x.com/a.png' });
    expect(r.status).toBe('accepted');
  });

  it('rate limits past burst', () => {
    const e = new PurgeEngine({
      clock,
      defaultRateLimit: { refillRatePerSec: 1, burst: 2 },
    });
    e.purge({ kind: PurgeKind.Tag, value: 'a' });
    e.purge({ kind: PurgeKind.Tag, value: 'b' });
    const r = e.purge({ kind: PurgeKind.Tag, value: 'c' });
    expect(r.status).toBe('rate_limited');
  });

  it('rejects malformed URLs', () => {
    const r = engine.purge({ kind: PurgeKind.Url, value: 'not a url' });
    expect(r.status).toBe('invalid');
  });

  it('matches url / prefix / wildcard purges', () => {
    expect(engine.matches({ kind: PurgeKind.Url, value: 'https://x.com/a' }, 'https://x.com/a')).toBe(true);
    expect(engine.matches({ kind: PurgeKind.Prefix, value: '/static' }, 'https://x.com/static/a.js')).toBe(true);
    expect(engine.matches({ kind: PurgeKind.Prefix, value: '/static' }, 'https://x.com/api/a')).toBe(false);
    expect(engine.matches({ kind: PurgeKind.Wildcard, value: '/img/*.png' }, 'https://x.com/img/logo.png')).toBe(true);
    expect(engine.matches({ kind: PurgeKind.Wildcard, value: '/img/*.png' }, 'https://x.com/img/sub/x.png')).toBe(false);
    expect(engine.matches({ kind: PurgeKind.Wildcard, value: '/img/**' }, 'https://x.com/img/sub/x.png')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// wildcardToRegex
// ---------------------------------------------------------------------------

describe('wildcardToRegex', () => {
  it('single vs double star', () => {
    expect(wildcardToRegex('/a/*').test('/a/b')).toBe(true);
    expect(wildcardToRegex('/a/*').test('/a/b/c')).toBe(false);
    expect(wildcardToRegex('/a/**').test('/a/b/c')).toBe(true);
    expect(wildcardToRegex('/a/*.js').test('/a/x.js')).toBe(true);
    expect(wildcardToRegex('/a/*.js').test('/a/x.ts')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OriginShield
// ---------------------------------------------------------------------------

describe('OriginShield', () => {
  const shield = new OriginShield(
    [
      { id: 'iad', region: 'us-east', latencyHint: 5 },
      { id: 'dub', region: 'eu-west', latencyHint: 2 },
      { id: 'iad2', region: 'us-east', latencyHint: 1 },
    ],
    'iad'
  );

  it('routes to lowest-latency same-region shield', () => {
    expect(shield.route('us-east')).toEqual({ shield: 'iad2', via: 'regional' });
    expect(shield.route('eu-west')).toEqual({ shield: 'dub', via: 'regional' });
  });

  it('falls back to default for unknown regions', () => {
    expect(shield.route('ap-south')).toEqual({ shield: 'iad', via: 'global_fallback' });
  });

  it('collapses concurrent fetches', async () => {
    let calls = 0;
    const fetch = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return 'data';
    };
    const [a, b] = await Promise.all([shield.collapse('k', fetch), shield.collapse('k', fetch)]);
    expect(a).toBe('data');
    expect(b).toBe('data');
    expect(calls).toBe(1);
    expect(shield.inflightCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// InvalidationBatcher
// ---------------------------------------------------------------------------

describe('InvalidationBatcher', () => {
  it('flushes on batch size', () => {
    const clock = new TestClock(0);
    const engine = new PurgeEngine({ clock });
    const flushed: number[] = [];
    const b = new InvalidationBatcher(engine, {
      maxBatch: 3,
      clock,
      onFlush: (r) => flushed.push(r.length),
    });
    b.enqueue({ kind: PurgeKind.Tag, value: 'a' });
    b.enqueue({ kind: PurgeKind.Tag, value: 'b' });
    b.enqueue({ kind: PurgeKind.Tag, value: 'c' });
    expect(flushed).toEqual([3]);
    expect(b.queueSize()).toBe(0);
  });

  it('dedups enqueued requests', () => {
    const engine = new PurgeEngine({ clock: new TestClock(0) });
    const b = new InvalidationBatcher(engine);
    expect(b.enqueue({ kind: PurgeKind.Tag, value: 'x' })).toBe(true);
    expect(b.enqueue({ kind: PurgeKind.Tag, value: 'x' })).toBe(false);
    expect(b.queueSize()).toBe(1);
  });

  it('flushes on tick after interval', () => {
    const clock = new TestClock(0);
    const engine = new PurgeEngine({ clock });
    const b = new InvalidationBatcher(engine, { flushIntervalMs: 1000, clock });
    b.enqueue({ kind: PurgeKind.Tag, value: 'a' });
    clock.advance(999);
    b.tick();
    expect(b.queueSize()).toBe(1);
    clock.advance(2);
    b.tick();
    expect(b.queueSize()).toBe(0);
  });

  it('sheds oldest when over maxQueue', () => {
    const engine = new PurgeEngine({ clock: new TestClock(0) });
    const b = new InvalidationBatcher(engine, { maxQueue: 2, maxBatch: 100 });
    b.enqueue({ kind: PurgeKind.Tag, value: '1' });
    b.enqueue({ kind: PurgeKind.Tag, value: '2' });
    b.enqueue({ kind: PurgeKind.Tag, value: '3' });
    expect(b.queueSize()).toBe(2);
    const res = b.flush();
    expect(res.map((r) => r.request.value)).toEqual(['2', '3']);
  });
});

// ---------------------------------------------------------------------------
// CdnRouter
// ---------------------------------------------------------------------------

describe('CdnRouter', () => {
  const providers = [
    { name: 'cloudflare', weight: 7, regions: [], healthy: true },
    { name: 'fastly', weight: 3, regions: [], healthy: true },
    { name: 'akamai', weight: 10, regions: ['eu-west'], healthy: false },
  ];

  it('excludes unhealthy and region-mismatched providers', () => {
    const r = new CdnRouter(providers, { rand: () => 0.99 });
    const d = r.route('us-east');
    expect(d?.provider).not.toBe('akamai');
  });

  it('weighted picks by roll', () => {
    // weights 7/3 → roll < 0.7 picks cloudflare
    const low = new CdnRouter(providers, { rand: () => 0.5 });
    const high = new CdnRouter(providers, { rand: () => 0.9 });
    expect(low.route('us-east')?.provider).toBe('cloudflare');
    expect(high.route('us-east')?.provider).toBe('fastly');
  });

  it('sticky routing is deterministic per key', () => {
    const r = new CdnRouter(providers);
    const a = r.routeSticky('https://x.com/a', 'us-east');
    const b = r.routeSticky('https://x.com/a', 'us-east');
    expect(a?.provider).toBe(b?.provider);
    expect(r.routeSticky('https://x.com/different', 'us-east')).not.toBeNull();
  });

  it('preferHitRatio amplifies effective weight', () => {
    const p = [
      { name: 'a', weight: 1, regions: [], healthy: true, hitRatio: 0 },
      { name: 'b', weight: 1, regions: [], healthy: true, hitRatio: 1 },
    ];
    // effective: a=1, b=2 → roll .6 → b
    const r = new CdnRouter(p, { rand: () => 0.6, preferHitRatio: true });
    expect(r.route('us-east')?.provider).toBe('b');
  });

  it('fnv1a is deterministic', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
  });
});
