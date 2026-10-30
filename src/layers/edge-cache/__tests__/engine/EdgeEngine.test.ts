/**
 * Edge-cache engine tests: popularity ranking + predictive warm plans,
 * two-level shield hierarchy coalescing, deploy-aware key versioning,
 * stale-if-error fallback, region analytics + rebalancing hints.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import {
  PopularityStats,
  CacheWarmingScheduler,
  ShieldHierarchy,
  KeyVersioning,
  mapStore,
  StaleIfError,
  RegionAnalytics,
} from '../../engine';
import { EdgeResponse } from '../../cdn/types';

const ok = (body: string, headers: Record<string, string> = {}): EdgeResponse => ({
  status: 200,
  headers: { 'cache-control': 'max-age=60', ...headers },
  body,
});

describe('PopularityStats', () => {
  let clock: ManualClock;
  let stats: PopularityStats;

  beforeEach(() => {
    clock = new ManualClock(0);
    stats = new PopularityStats({ halfLifeMs: 60_000 }, clock);
  });

  it('ranks frequent keys above rare ones', () => {
    for (let i = 0; i < 20; i++) stats.recordAccess('/hot');
    stats.recordAccess('/cold');
    const top = stats.topKeys(2);
    expect(top[0].key).toBe('/hot');
  });

  it('recency bonus lifts a just-accessed key over a stale-hot one', () => {
    for (let i = 0; i < 30; i++) stats.recordAccess('/old-hot');
    clock.advance(600_000); // 10min quiet — rate decays hard
    for (let i = 0; i < 8; i++) stats.recordAccess('/rising');
    expect(stats.scoreOf('/rising')).toBeGreaterThan(stats.scoreOf('/old-hot'));
  });

  it('warmCandidates skips keys still fresh beyond the horizon', () => {
    stats.recordAccess('/a');
    stats.recordAccess('/b');
    const now = clock.nowMs();
    const freshUntil = (k: string) => (k === '/a' ? now + 3600_000 : undefined);
    const cands = stats.warmCandidates(10, freshUntil, { horizonMs: 60_000 });
    expect(cands.map((c) => c.key)).toEqual(['/b']); // /a is fresh for an hour
  });
});

describe('CacheWarmingScheduler', () => {
  let clock: ManualClock;
  let stats: PopularityStats;
  let sched: CacheWarmingScheduler;

  beforeEach(() => {
    clock = new ManualClock(0);
    stats = new PopularityStats({}, clock);
    sched = new CacheWarmingScheduler(stats, { maxConcurrent: 2, cooldownMs: 60_000 }, clock);
  });

  it('plans from popularity and executes preloads', async () => {
    for (let i = 0; i < 10; i++) stats.recordAccess('/hot');
    stats.recordAccess('/mid');
    const fetched: string[] = [];
    const summary = await sched.warm(5, () => undefined, async (req) => {
      fetched.push(req.url);
      return ok('x');
    });
    expect(summary.succeeded).toBe(2);
    expect(fetched).toContain('/hot');
  });

  it('respects cooldown — no double warming inside the window', async () => {
    stats.recordAccess('/k');
    await sched.warm(5, () => undefined, async () => ok('x'));
    const plan2 = sched.planWarming(5, () => undefined);
    expect(plan2.keys).toHaveLength(0); // still in cooldown
    clock.advance(61_000);
    const plan3 = sched.planWarming(5, () => undefined);
    expect(plan3.keys).toHaveLength(1);
  });

  it('caps concurrency at maxConcurrent', async () => {
    for (let i = 0; i < 6; i++) stats.recordAccess(`/k${i}`);
    let active = 0;
    let peak = 0;
    await sched.warm(6, () => undefined, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return ok('x');
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('ShieldHierarchy', () => {
  let clock: ManualClock;

  beforeEach(() => {
    clock = new ManualClock(0);
  });

  it('coalesces at regional level: two edges in a region → 1 forwarded', async () => {
    const h = new ShieldHierarchy({ regions: ['eu', 'us'], clock });
    let originCalls = 0;
    h.bindOrigin(async (req) => {
      originCalls++;
      await new Promise((r) => setTimeout(r, 5));
      return ok('body');
    });
    const req = { method: 'GET' as const, url: '/x', headers: {}, region: 'eu' };
    const [a, b] = await Promise.all([h.fetch(req), h.fetch(req)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // Regional single-flight coalesced the pair.
    const eu = h.stats().regions.find((r) => r.region === 'eu')!;
    expect(eu.requests).toBe(2);
    expect(eu.forwarded).toBe(1);
    expect(originCalls).toBe(1);
  });

  it('cross-region requests share ONE origin call via the central shield', async () => {
    const h = new ShieldHierarchy({ regions: ['eu', 'us'], clock });
    let originCalls = 0;
    h.bindOrigin(async () => {
      originCalls++;
      await new Promise((r) => setTimeout(r, 5));
      return ok('body');
    });
    await Promise.all([
      h.fetch({ method: 'GET', url: '/shared', headers: {}, region: 'eu' }),
      h.fetch({ method: 'GET', url: '/shared', headers: {}, region: 'us' }),
    ]);
    expect(originCalls).toBe(1);
  });

  it('regional shield cache serves repeat misses without re-fetching', async () => {
    const h = new ShieldHierarchy({ regions: ['eu'], clock, shieldTtlMs: 60_000 });
    let originCalls = 0;
    h.bindOrigin(async () => {
      originCalls++;
      return ok('v1');
    });
    await h.fetch({ method: 'GET', url: '/y', headers: {}, region: 'eu' });
    const r2 = await h.fetch({ method: 'GET', url: '/y', headers: {}, region: 'eu' });
    expect(r2.body).toBe('v1');
    expect(originCalls).toBe(1); // second served by shield cache
    expect(h.stats().regions[0].shieldHits).toBe(1);
  });
});

describe('KeyVersioning', () => {
  it('new deploy orphans old keys without purging', () => {
    const map = new Map<string, string>();
    const v = new KeyVersioning(mapStore(map));
    v.set('/a', 'old-value');
    v.bump();
    expect(v.get('/a')).toBeUndefined();
    v.set('/a', 'new-value');
    expect(v.get('/a')).toBe('new-value');
    expect(map.size).toBe(2); // old entry still there, unreachable
  });

  it('purgeOldVersions reclaims orphaned entries', () => {
    const map = new Map<string, string>();
    const v = new KeyVersioning(mapStore(map));
    v.set('/a', '1');
    v.set('/b', '1');
    v.bump();
    v.set('/a', '2');
    expect(v.purgeOldVersions()).toBe(2); // both v1 entries orphaned
    expect(map.size).toBe(1); // only v2::/a remains
    expect(v.get('/a')).toBe('2');
  });

  it('invalidateVersion drops a whole deploy (rollback)', () => {
    const map = new Map<string, string>();
    const v = new KeyVersioning(mapStore(map));
    v.set('/a', 'v1');
    v.bump();
    v.set('/a', 'v2-bad');
    expect(v.invalidateVersion(2)).toBe(1);
    expect(v.get('/a')).toBeUndefined();
  });

  it('versionOf/stripVersion round-trip', () => {
    expect(KeyVersioning.versionOf('v7::/path')).toBe(7);
    expect(KeyVersioning.stripVersion('v7::/path')).toBe('/path');
    expect(KeyVersioning.versionOf('/plain')).toBe(0);
  });
});

describe('StaleIfError', () => {
  let clock: ManualClock;
  let sie: StaleIfError;

  const entry = (storedAt: number, cc?: string) => ({
    response: ok('cached', cc ? { 'cache-control': cc } : {}),
    storedAt,
  });

  beforeEach(() => {
    clock = new ManualClock(100_000);
    sie = new StaleIfError({ defaultSieMs: 60_000 }, clock);
  });

  it('serves stale on origin 5xx inside the window', () => {
    const d = sie.decide(entry(50_000), { status: 503, headers: {}, body: '' });
    expect(d.serve).toBe('stale');
    if (d.serve === 'stale') expect(d.ageSeconds).toBe(50);
  });

  it('serves stale on thrown origin error', () => {
    const d = sie.decide(entry(90_000), undefined, new Error('conn reset'));
    expect(d.serve).toBe('stale');
  });

  it('refuses stale past the SIE window', () => {
    const d = sie.decide(entry(10_000), { status: 503, headers: {}, body: '' });
    expect(d.serve).toBe('error'); // 90s old > 60s window
  });

  it('does NOT serve stale on 4xx (not an origin failure)', () => {
    const d = sie.decide(entry(95_000), { status: 404, headers: {}, body: '' });
    expect(d.serve).toBe('fresh');
  });

  it('response stale-if-error directive overrides the default', () => {
    const e = entry(10_000, 'max-age=30, stale-if-error=120'); // 120s window
    const d = sie.decide(e, { status: 500, headers: {}, body: '' });
    expect(d.serve).toBe('stale'); // 90s old < 120s window
  });

  it('fetchWithFallback end-to-end', async () => {
    const out = await sie.fetchWithFallback(entry(95_000), async () => {
      throw new Error('down');
    });
    expect('disposition' in out && out.disposition).toBe('stale');
    expect(sie.stats().servedStale).toBe(1);
  });
});

describe('RegionAnalytics', () => {
  it('computes rolling hit-rate and trends', () => {
    const ra = new RegionAnalytics({ windowSize: 10 });
    // Alternate hit/miss → 50% flat trend.
    for (let i = 0; i < 10; i++) ra.record('eu', i % 2 === 0);
    const r = ra.report('eu');
    expect(r.hitRate).toBeCloseTo(0.5);
    expect(r.trend).toBe('flat');
    // First half all hits, last quarter all misses → trend down.
    const ra2 = new RegionAnalytics({ windowSize: 12 });
    for (let i = 0; i < 6; i++) ra2.record('eu', true);
    for (let i = 0; i < 6; i++) ra2.record('eu', false);
    const r2 = ra2.report('eu');
    expect(r2.hitRate).toBeCloseTo(0.5);
    expect(r2.trend).toBe('down');
    // Inverse: misses then hits → trend up.
    const ra3 = new RegionAnalytics({ windowSize: 12 });
    for (let i = 0; i < 6; i++) ra3.record('eu', false);
    for (let i = 0; i < 6; i++) ra3.record('eu', true);
    expect(ra3.report('eu').trend).toBe('up');
  });

  it('hints regions below the threshold vs the best', () => {
    const ra = new RegionAnalytics({ windowSize: 50 });
    for (let i = 0; i < 40; i++) ra.record('us', true);   // 100% hit
    for (let i = 0; i < 40; i++) ra.record('eu', i < 5); // ~12% hit
    const hints = ra.hints(0.6);
    expect(hints).toHaveLength(1);
    expect(hints[0].region).toBe('eu');
    expect(hints[0].kind).toBe('replicate');
    expect(hints[0].weight).toBeGreaterThan(0.5);
  });

  it('ignores regions with too little traffic', () => {
    const ra = new RegionAnalytics();
    ra.record('tiny', false);
    expect(ra.hints()).toHaveLength(0);
  });
});
