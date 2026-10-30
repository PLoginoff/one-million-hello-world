/**
 * Cache Engine — unit tests.
 *
 * All time-dependent behavior runs on `ManualEngineClock` so TTL expiry,
 * write-behind flush cadence, and adaptive-TTL windows are deterministic.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  AdaptiveTtlPolicy,
  BackingStoreError,
  CacheWarmer,
  ConsistentHashRing,
  CountingBloomFilter,
  CountMinSketch,
  InMemoryBackingStore,
  ManualEngineClock,
  MultiLevelCache,
  SingleFlightCache,
  StampedeLimitError,
  TagInvalidationIndex,
  TinyLfuAdmission,
} from '../index';
import type { BackingStore } from '../index';

/* ------------------------------------------------------------------ */
/* MultiLevelCache                                                     */
/* ------------------------------------------------------------------ */

describe('MultiLevelCache', () => {
  let clock: ManualEngineClock;
  let l2: InMemoryBackingStore<string>;

  beforeEach(() => {
    clock = new ManualEngineClock();
    l2 = new InMemoryBackingStore<string>(clock);
  });

  it('serves L1 hit without touching L2', async () => {
    const cache = new MultiLevelCache<string>(l2, { clock });
    await cache.set('k', 'v');
    l2.reads = 0;
    const r = await cache.get('k');
    expect(r.hit).toBe(true);
    expect(r.value).toBe('v');
    expect(r.level).toBe('L1');
    expect(l2.reads).toBe(0);
  });

  it('promotes L2 hit into L1', async () => {
    const cache = new MultiLevelCache<string>(l2, { clock, writePolicy: 'write-around' });
    await cache.set('k', 'v'); // goes only to L2
    expect(cache.l1Size).toBe(0);

    const r1 = await cache.get('k');
    expect(r1.hit).toBe(true);
    expect(r1.level).toBe('L2');

    const r2 = await cache.get('k');
    expect(r2.level).toBe('L1');
    const s = cache.stats();
    expect(s.promotedToL1).toBe(1);
  });

  it('expires L1 entries on the clock', async () => {
    const cache = new MultiLevelCache<string>(l2, { clock, defaultTtlMs: 1000 });
    await cache.set('k', 'v');
    clock.advance(999);
    expect((await cache.get('k')).hit).toBe(true);
    clock.advance(2);
    const r = await cache.get('k');
    // Expired from L1 but still in L2 (write-through copied ttl too)
    expect(r.level === 'L2' || r.hit === false).toBe(true);
  });

  it('write-behind queues and flushes to L2', async () => {
    const cache = new MultiLevelCache<string>(l2, {
      clock,
      writePolicy: 'write-behind',
      writeBehindMaxQueue: 10,
    });
    await cache.set('a', '1');
    await cache.set('b', '2');
    await cache.set('a', '3'); // coalesced with earlier 'a' write
    expect(cache.stats().dirtyQueueSize).toBe(3);
    expect(l2.peek('a')).toBe(null);

    const applied = await cache.flush();
    expect(applied).toBe(2); // a once (last value), b once
    expect(l2.peek('a')).toBe('3');
    expect(l2.peek('b')).toBe('2');
    expect(cache.stats().dirtyQueueSize).toBe(0);
  });

  it('write-behind flushIfDue respects interval', async () => {
    const cache = new MultiLevelCache<string>(l2, {
      clock,
      writePolicy: 'write-behind',
      writeBehindFlushIntervalMs: 500,
    });
    await cache.set('a', '1');
    clock.advance(100);
    expect(await cache.flushIfDue()).toBe(0);
    clock.advance(500);
    expect(await cache.flushIfDue()).toBe(1);
  });

  it('L1 evicts LRU when full', async () => {
    const cache = new MultiLevelCache<string>(null, { clock, l1MaxSize: 2 });
    await cache.set('a', '1');
    await cache.set('b', '2');
    await cache.get('a'); // touch a → b is LRU now
    await cache.set('c', '3');
    expect((await cache.get('b')).hit).toBe(false);
    expect((await cache.get('a')).hit).toBe(true);
    expect(cache.stats().l1Evictions).toBe(1);
  });

  it('isolates L2 errors on read', async () => {
    const flaky: BackingStore<string> = {
      get: () => Promise.reject(new BackingStoreError('down')),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(false),
    };
    const cache = new MultiLevelCache<string>(flaky, { clock });
    const r = await cache.get('k');
    expect(r.hit).toBe(false);
    expect(cache.stats().l2Errors).toBe(1);
  });

  it('invalidateTag removes tagged keys', async () => {
    const cache = new MultiLevelCache<string>(l2, { clock });
    await cache.set('u1', 'a', { tags: ['user:1'] });
    await cache.set('u1b', 'b', { tags: ['user:1'] });
    await cache.set('other', 'c', { tags: ['user:2'] });
    const removed = await cache.invalidateTag('user:1');
    expect(removed.sort()).toEqual(['u1', 'u1b']);
    expect((await cache.get('other')).hit).toBe(true);
  });

  it('sweep removes only expired L1 entries', async () => {
    const cache = new MultiLevelCache<string>(null, { clock });
    await cache.set('x', '1', { ttlMs: 100 });
    await cache.set('y', '2', { ttlMs: 10_000 });
    clock.advance(500);
    expect(cache.sweep()).toBe(1);
    expect((await cache.get('y')).hit).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* SingleFlightCache                                                   */
/* ------------------------------------------------------------------ */

describe('SingleFlightCache', () => {
  let clock: ManualEngineClock;

  beforeEach(() => {
    clock = new ManualEngineClock();
  });

  it('collapses concurrent loads into one loader call', async () => {
    let calls = 0;
    let release: (v: string) => void = () => undefined;
    const gate = new Promise<string>((res) => {
      release = res;
    });
    const sf = new SingleFlightCache<string>(() => {
      calls++;
      return gate;
    }, { clock });

    const p1 = sf.get('hot');
    const p2 = sf.get('hot');
    const p3 = sf.get('hot');
    release('v');
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(calls).toBe(1);
    expect(r1.value).toBe('v');
    expect(r2.shared).toBe(true);
    expect(r3.shared).toBe(true);
    expect(sf.stats().shared).toBe(2);
  });

  it('does not cache loader failures', async () => {
    let calls = 0;
    const sf = new SingleFlightCache<string>(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('boom'));
      return Promise.resolve('ok');
    }, { clock });

    await expect(sf.get('k')).rejects.toThrow('boom');
    const r = await sf.get('k');
    expect(r.value).toBe('ok');
    expect(calls).toBe(2);
  });

  it('negative-caches undefined results for the negative TTL', async () => {
    let calls = 0;
    const sf = new SingleFlightCache<string>(() => {
      calls++;
      return Promise.resolve(undefined);
    }, { clock, negativeTtlMs: 1000 });

    const r1 = await sf.get('absent');
    expect(r1.value).toBeUndefined();
    const r2 = await sf.get('absent');
    expect(r2.value).toBeUndefined();
    expect(calls).toBe(1); // second call served by negative cache
    clock.advance(1001);
    await sf.get('absent');
    expect(calls).toBe(2);
  });

  it('serves stale within SWR window and refreshes in background', async () => {
    let calls = 0;
    const sf = new SingleFlightCache<string>(() => {
      calls++;
      return Promise.resolve(`v${calls}`);
    }, { clock, valueTtlMs: 100, swrMs: 500 });

    const r1 = await sf.get('k');
    expect(r1.value).toBe('v1');
    clock.advance(300); // past valueTtl, inside swr
    const r2 = await sf.get('k');
    expect(r2.value).toBe('v1');
    expect(r2.servedStale).toBe(true);
    // wait for the background refresh to land (it's a real promise)
    await new Promise((r) => setTimeout(r, 0));
    const r3 = await sf.get('k');
    expect(r3.servedStale).toBe(false);
    expect(r3.value).toBe('v2');
  });

  it('enforces maxWaiters', async () => {
    let release: (v: string) => void = () => undefined;
    const gate = new Promise<string>((res) => {
      release = res;
    });
    const sf = new SingleFlightCache<string>(() => gate, { clock, maxWaiters: 2 });
    const p1 = sf.get('k');
    const p2 = sf.get('k');
    await expect(sf.get('k')).rejects.toBeInstanceOf(StampedeLimitError);
    release('v');
    await p1;
    await p2;
  });
});

/* ------------------------------------------------------------------ */
/* CacheWarmer                                                         */
/* ------------------------------------------------------------------ */

describe('CacheWarmer', () => {
  let clock: ManualEngineClock;

  beforeEach(() => {
    clock = new ManualEngineClock();
  });

  it('warms all keys with bounded concurrency', async () => {
    const cache = new Map<string, number>();
    let inFlight = 0;
    let maxInFlight = 0;
    const warmer = new CacheWarmer<number>(
      async (key) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return key.length;
      },
      (k, v) => {
        cache.set(k, v);
      },
      { clock, concurrency: 3 },
    );
    const keys = Array.from({ length: 10 }, (_, i) => `key-${i}`);
    const report = await warmer.warm(keys);
    expect(report.succeeded).toBe(10);
    expect(report.failed.length).toBe(0);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(cache.size).toBe(10);
  });

  it('collects per-key failures without aborting the batch', async () => {
    const cache = new Map<string, string>();
    const warmer = new CacheWarmer<string>(
      (key) => (key === 'bad' ? Promise.reject(new Error('nope')) : Promise.resolve(key)),
      (k, v) => cache.set(k, v),
      { clock },
    );
    const report = await warmer.warm(['a', 'bad', 'b']);
    expect(report.succeeded).toBe(2);
    expect(report.failed.length).toBe(1);
    expect(report.failed[0].key).toBe('bad');
  });

  it('times out slow loaders per key', async () => {
    const cache = new Map<string, string>();
    const warmer = new CacheWarmer<string>(
      (key) =>
        key === 'slow'
          ? new Promise((r) => setTimeout(() => r('late'), 500))
          : Promise.resolve(key),
      (k, v) => cache.set(k, v),
      { clock, perKeyTimeoutMs: 20 },
    );
    const report = await warmer.warm(['slow', 'fast']);
    expect(report.succeeded).toBe(1);
    expect(report.failed[0].timedOut).toBe(true);
  });

  it('honors abort between keys', async () => {
    const done: string[] = [];
    const warmer = new CacheWarmer<string>(
      async (key) => {
        done.push(key);
        if (done.length === 1) warmer.abort();
        return key;
      },
      () => undefined,
      { clock, concurrency: 1 },
    );
    const report = await warmer.warm(['a', 'b', 'c', 'd']);
    expect(report.aborted).toBe(true);
    expect(report.succeeded).toBeLessThan(4);
  });
});

/* ------------------------------------------------------------------ */
/* TagInvalidationIndex                                                */
/* ------------------------------------------------------------------ */

describe('TagInvalidationIndex', () => {
  let idx: TagInvalidationIndex;

  beforeEach(() => {
    idx = new TagInvalidationIndex();
  });

  it('maps keys to tags and back', () => {
    idx.add('k1', ['a', 'b']);
    idx.add('k2', ['b']);
    expect(idx.keysForTag('b').sort()).toEqual(['k1', 'k2']);
    expect(idx.tagsForKey('k1').sort()).toEqual(['a', 'b']);
    expect(idx.size).toBe(3);
  });

  it('removeKey cleans all tag sets and drops empty tags', () => {
    idx.add('k1', ['solo']);
    idx.add('k2', ['shared', 'solo2']);
    idx.add('k3', ['shared']);
    const removed = idx.removeKey('k1');
    expect(removed).toEqual(['solo']);
    expect(idx.hasTag('solo')).toBe(false);
    idx.removeKey('k2');
    expect(idx.keysForTag('shared')).toEqual(['k3']);
  });

  it('removeTag unlinks keys without deleting them', () => {
    idx.add('k1', ['x', 'y']);
    idx.removeTag('x');
    expect(idx.tagsForKey('k1')).toEqual(['y']);
    expect(idx.keys().length).toBe(1);
  });

  it('replace swaps tag set atomically', () => {
    idx.add('k', ['old1', 'old2']);
    idx.replace('k', ['new']);
    expect(idx.tagsForKey('k')).toEqual(['new']);
    expect(idx.hasTag('old1')).toBe(false);
  });

  it('is idempotent on duplicate add', () => {
    idx.add('k', ['t']);
    idx.add('k', ['t']);
    expect(idx.size).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* AdaptiveTtlPolicy                                                   */
/* ------------------------------------------------------------------ */

describe('AdaptiveTtlPolicy', () => {
  let clock: ManualEngineClock;
  let policy: AdaptiveTtlPolicy;

  beforeEach(() => {
    clock = new ManualEngineClock();
    policy = new AdaptiveTtlPolicy({
      initialTtlMs: 1000,
      minTtlMs: 100,
      maxTtlMs: 10_000,
      clock,
    });
  });

  it('starts unseen keys at initial TTL', () => {
    expect(policy.ttlFor('new')).toBe(1000);
  });

  it('grows TTL when expired hits dominate', () => {
    policy.recordWrite('k', 1000);
    clock.advance(1050); // within lateGrace of expiry
    policy.recordMiss('k'); // counts as expiredHit
    const d = policy.recompute('k');
    expect(d.direction).toBe('grew');
    expect(d.newTtlMs).toBe(1500);
  });

  it('shrinks TTL when writes are never hit', () => {
    policy.recordWrite('k', 1000);
    clock.advance(50_000); // way past grace — plain miss
    policy.recordMiss('k');
    const d = policy.recompute('k');
    expect(d.direction).toBe('shrank');
    expect(d.newTtlMs).toBe(600);
  });

  it('leaves hot keys unchanged', () => {
    for (let i = 0; i < 10; i++) policy.recordHit('hot');
    const d = policy.recompute('hot');
    expect(d.direction).toBe('unchanged');
    expect(d.newTtlMs).toBe(1000);
  });

  it('clamps at maxTtlMs', () => {
    for (let i = 0; i < 5; i++) {
      policy.recordWrite('k', policy.ttlFor('k'));
      clock.advance(policy.ttlFor('k') + 10);
      policy.recordMiss('k');
      policy.recompute('k');
    }
    expect(policy.ttlFor('k')).toBeLessThanOrEqual(10_000);
  });

  it('sweeps keys idle past staleKeyMs', () => {
    policy.recordHit('gone');
    clock.advance(3_700_000);
    expect(policy.sweepStale()).toBe(1);
    expect(policy.trackedKeys).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* ConsistentHashRing                                                  */
/* ------------------------------------------------------------------ */

describe('ConsistentHashRing', () => {
  it('assigns keys deterministically to nodes', () => {
    const ring = new ConsistentHashRing(50);
    ring.add({ id: 'a' });
    ring.add({ id: 'b' });
    ring.add({ id: 'c' });
    expect(ring.owner('key1')).toBe(ring.owner('key1'));
    expect(['a', 'b', 'c']).toContain(ring.owner('key1')!);
  });

  it('removing a node remaps only its share of keys', () => {
    const ring = new ConsistentHashRing(100);
    ring.add({ id: 'a' });
    ring.add({ id: 'b' });
    ring.add({ id: 'c' });
    const keys = Array.from({ length: 3000 }, (_, i) => `k${i}`);
    const before = new Map(keys.map((k) => [k, ring.owner(k)]));
    ring.remove('b');
    let remapped = 0;
    for (const k of keys) {
      if (ring.owner(k) !== before.get(k)) remapped++;
    }
    // Theory: ~1/3 of keys move. Loose bound: under 60%.
    expect(remapped).toBeGreaterThan(0);
    expect(remapped).toBeLessThan(1800);
  });

  it('owners returns distinct nodes in ring order', () => {
    const ring = new ConsistentHashRing(50);
    ring.add({ id: 'a' });
    ring.add({ id: 'b' });
    ring.add({ id: 'c' });
    const owners = ring.owners('key', 2);
    expect(owners.length).toBe(2);
    expect(owners[0]).not.toBe(owners[1]);
  });

  it('heavier weight owns more of the ring', () => {
    const ring = new ConsistentHashRing(100);
    ring.add({ id: 'small', weight: 1 });
    ring.add({ id: 'big', weight: 4 });
    expect(ring.ownership('big')).toBeGreaterThan(ring.ownership('small'));
  });

  it('empty ring returns null', () => {
    const ring = new ConsistentHashRing();
    expect(ring.owner('k')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* CountMinSketch + TinyLfu                                            */
/* ------------------------------------------------------------------ */

describe('CountMinSketch', () => {
  it('estimates frequencies with bounded error', () => {
    const s = new CountMinSketch(512, 4);
    for (let i = 0; i < 100; i++) s.add('hot');
    for (let i = 0; i < 10; i++) s.add('cold');
    expect(s.estimate('hot')).toBeGreaterThanOrEqual(100);
    expect(s.estimate('cold')).toBeGreaterThanOrEqual(10);
    expect(s.estimate('never')).toBe(0);
    // Over-estimate bounded by ε·N = (e/512)·110 ≈ 0.6
    expect(s.estimate('hot')).toBeLessThan(110);
  });

  it('halving decays old popularity', () => {
    const s = new CountMinSketch(256, 3);
    for (let i = 0; i < 100; i++) s.add('k');
    s.halve();
    expect(s.estimate('k')).toBeLessThanOrEqual(50);
  });
});

describe('TinyLfuAdmission', () => {
  it('admits a hotter candidate over a colder victim', () => {
    const a = new TinyLfuAdmission({ width: 512, depth: 4 });
    for (let i = 0; i < 50; i++) a.record('hot-candidate');
    a.record('cold-victim');
    expect(a.admit('hot-candidate', 'cold-victim')).toBe(true);
    expect(a.admit('cold-victim', 'hot-candidate')).toBe(false);
  });

  it('scan-resists one-shot keys', () => {
    const a = new TinyLfuAdmission({ resetEvery: 1_000_000 });
    for (let i = 0; i < 100; i++) a.record('stable-key');
    // a scan of one-shot keys shouldn't displace the stable one
    const scanKeys = Array.from({ length: 1000 }, (_, i) => `scan-${i}`);
    for (const k of scanKeys) a.record(k);
    // most scan keys still lose to the stable key — allow some
    // collision-induced false admits in the loose check
    let rejected = 0;
    for (const k of scanKeys) {
      if (!a.admit(k, 'stable-key')) rejected++;
    }
    expect(rejected).toBeGreaterThan(900);
  });
});

/* ------------------------------------------------------------------ */
/* CountingBloomFilter                                                 */
/* ------------------------------------------------------------------ */

describe('CountingBloomFilter', () => {
  it('reports added keys and denies absent ones (mostly)', () => {
    const f = new CountingBloomFilter(10_000, 0.01);
    for (let i = 0; i < 1000; i++) f.add(`k${i}`);
    for (let i = 0; i < 1000; i++) {
      expect(f.maybePresent(`k${i}`)).toBe(true);
    }
    // FPP check: absent keys should mostly say no
    let falsePos = 0;
    for (let i = 0; i < 1000; i++) {
      if (f.maybePresent(`absent-${i}`)) falsePos++;
    }
    expect(falsePos).toBeLessThan(50); // well under 5%
  });

  it('delete removes keys', () => {
    const f = new CountingBloomFilter(1000, 0.01);
    f.add('gone');
    expect(f.maybePresent('gone')).toBe(true);
    f.delete('gone');
    expect(f.maybePresent('gone')).toBe(false);
  });

  it('delete on absent key returns false', () => {
    const f = new CountingBloomFilter(1000, 0.01);
    expect(f.delete('never-added')).toBe(false);
  });
});
