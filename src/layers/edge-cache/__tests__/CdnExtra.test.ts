/**
 * CDN extra tests — OriginShield collapse/concurrency, CacheWarmer.
 */

import { describe, it, expect } from 'bun:test';
import { OriginShield } from '../cdn/OriginShield';
import { CacheWarmer } from '../cdn/CacheWarmer';
import { EdgeCacheEngine } from '../cdn/EdgeCacheEngine';
import { EdgeRequest, EdgeResponse, CacheDisposition } from '../cdn/types';

const get = (url: string): EdgeRequest => ({ method: 'GET', url, headers: {} });
const ok = (body: string, headers: Record<string, string> = {}): EdgeResponse => ({
  status: 200,
  headers: { 'cache-control': 'max-age=60', ...headers },
  body,
});

describe('OriginShield', () => {
  it('coalesces identical concurrent fetches across callers', async () => {
    const shield = new OriginShield();
    let originCalls = 0;
    const origin = () => {
      originCalls++;
      return new Promise<EdgeResponse>((r) => setTimeout(() => r(ok('x')), 10));
    };
    const [a, b] = await Promise.all([shield.fetch(get('/a'), origin), shield.fetch(get('/a'), origin)]);
    expect(originCalls).toBe(1);
    expect(a.body).toBe('x');
    expect(shield.stats().coalesced).toBe(1);
    void b;
  });

  it('caps origin concurrency and queues the rest', async () => {
    const shield = new OriginShield({ maxConcurrency: 2 });
    let active = 0;
    let peak = 0;
    const origin = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 8));
      active--;
      return ok('x');
    };
    await Promise.all([1, 2, 3, 4, 5].map((i) => shield.fetch(get(`/u${i}`), origin)));
    expect(peak).toBeLessThanOrEqual(2);
    expect(shield.stats().originFetches).toBe(5);
    expect(shield.stats().maxQueueDepth).toBeGreaterThanOrEqual(1);
  });

  it('retries 5xx then succeeds', async () => {
    const shield = new OriginShield({ maxRetries: 2, retryBaseMs: 1 });
    let calls = 0;
    const origin = () => {
      calls++;
      if (calls < 3) return Promise.resolve({ status: 503, headers: {}, body: 'err' });
      return Promise.resolve(ok('recovered'));
    };
    const r = await shield.fetch(get('/flaky'), origin);
    expect(r.status).toBe(200);
    expect(shield.stats().retries).toBe(2);
  });
});

describe('CacheWarmer', () => {
  it('warms a manifest through the engine', async () => {
    const engine = new EdgeCacheEngine({});
    const warmer = new CacheWarmer(engine, 2);
    const origin = (req: EdgeRequest) => Promise.resolve(ok(`body:${req.url}`));
    const summary = await warmer.warm(
      [{ url: '/a' }, { url: '/b', tags: ['img'] }, { url: '/c' }],
      origin
    );
    expect(summary.total).toBe(3);
    expect(summary.warmed).toBe(3);
    expect(summary.failed).toBe(0);
    expect(engine.size()).toBe(3);
    // Second warm: all hits
    const again = await warmer.warm([{ url: '/a' }], origin);
    expect(again.alreadyCached).toBe(1);
    // Tag-purge the tagged one
    expect(engine.purge({ kind: 'tag', tag: 'img' })).toBe(1);
  });

  it('reports failures and supports selective retry', async () => {
    const engine = new EdgeCacheEngine({});
    const warmer = new CacheWarmer(engine);
    const flaky = (req: EdgeRequest) =>
      req.url === '/bad' ? Promise.reject(new Error('down')) : Promise.resolve(ok('b'));
    const items = [{ url: '/good' }, { url: '/bad' }];
    const summary = await warmer.warm(items, flaky);
    expect(summary.failed).toBe(1);
    const retry = await warmer.retryFailed(items, summary, () => Promise.resolve(ok('fixed')));
    expect(retry.warmed).toBe(1);
    expect(retry.results[0].url).toBe('/bad');
  });
});

describe('EdgeCacheEngine — additional semantics', () => {
  it('HEAD shares the GET entry (same key)', async () => {
    const engine = new EdgeCacheEngine({});
    await engine.fetch(get('/h'), () => Promise.resolve(ok('b')));
    const r = await engine.fetch({ method: 'HEAD', url: '/h', headers: {} }, () => Promise.reject(new Error('no origin')));
    expect(r.disposition).toBe(CacheDisposition.HIT);
  });

  it('no-cache response directive is not stored', async () => {
    const engine = new EdgeCacheEngine({});
    let calls = 0;
    const origin = () => { calls++; return Promise.resolve(ok('x', { 'cache-control': 'no-cache' })); };
    await engine.fetch(get('/nc-r'), origin);
    await engine.fetch(get('/nc-r'), origin);
    expect(calls).toBe(2);
    expect(engine.size()).toBe(0);
  });

  it('if-modified-since revalidation works without etag', async () => {
    let now = 1_000_000;
    const engine = new EdgeCacheEngine({}, () => now);
    const lm = new Date(now - 500_000).toUTCString();
    const origin = (req: EdgeRequest) => {
      if (req.headers['if-modified-since'] === lm) {
        return Promise.resolve({ status: 304, headers: { 'cache-control': 'max-age=60' }, body: '' });
      }
      return Promise.resolve(ok('b', { 'cache-control': 'max-age=10', 'last-modified': lm }));
    };
    await engine.fetch(get('/ims'), origin);
    now += 15_000;
    const r = await engine.fetch(get('/ims'), origin);
    expect(r.revalidated304).toBe(true);
  });
});
