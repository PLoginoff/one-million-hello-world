/**
 * Tests for ReservoirSampler, CentroidDigest and SamplingProfiler.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ReservoirSampler,
  CentroidDigest,
  SamplingProfiler,
  SequenceProfileRandom,
} from '../SamplingProfiler';

describe('ReservoirSampler', () => {
  it('fills the reservoir before sampling kicks in', () => {
    const r = new ReservoirSampler({ size: 3, random: new SequenceProfileRandom([0.9]) });
    r.observe(1);
    r.observe(2);
    r.observe(3);
    expect(r.sample()).toEqual([1, 2, 3]);
    expect(r.count).toBe(3);
  });

  it('admits stream item i with probability k/i deterministically', () => {
    // j = floor(roll * i); with roll 0.1 and i=4 → j=0 < k=3 → replace slot 0
    const r = new ReservoirSampler({ size: 3, random: new SequenceProfileRandom([0.1, 0.9]) });
    r.observe(1);
    r.observe(2);
    r.observe(3);
    r.observe(4); // i=4, roll 0.1 → j=0 → reservoir[0] = 4
    expect(r.sample()).toEqual([4, 2, 3]);
    r.observe(5); // i=5, roll 0.9 → j=4 ≥ k → skipped
    expect(r.sample()).toEqual([4, 2, 3]);
    expect(r.count).toBe(5);
  });

  it('long streams produce a diverse sample across positions', () => {
    const r = new ReservoirSampler({ size: 10 });
    for (let i = 0; i < 10_000; i++) r.observe(i);
    const s = r.sample();
    expect(s.length).toBe(10);
    // With k=10 and N=10k, early items are mostly evicted — but the
    // sample shouldn't be a contiguous suffix either. Check spread.
    const sorted = r.sortedSample();
    expect(sorted[0]!).toBeLessThan(9_999);
  });

  it('sortedSample returns ascending order without mutating state', () => {
    const r = new ReservoirSampler({ size: 5, random: new SequenceProfileRandom([0.5]) });
    r.observe(5);
    r.observe(1);
    r.observe(3);
    expect(r.sortedSample()).toEqual([1, 3, 5]);
    expect(r.sample()).toEqual([5, 1, 3]);
  });

  it('rejects non-positive size and clear() resets', () => {
    expect(() => new ReservoirSampler({ size: 0 })).toThrow();
    const r = new ReservoirSampler({ size: 2 });
    r.observe(1);
    r.clear();
    expect(r.count).toBe(0);
    expect(r.sample()).toEqual([]);
  });
});

describe('CentroidDigest', () => {
  let d: CentroidDigest;

  beforeEach(() => {
    d = new CentroidDigest({ centroids: 50 });
  });

  it('exact quantiles on a small distinct input', () => {
    for (const v of [10, 20, 30, 40, 50]) d.observe(v);
    expect(d.quantile(0)).toBe(10);
    expect(d.quantile(1)).toBe(50);
    // p50 lands inside the middle centroid — approximations allowed.
    const p50 = d.quantile(0.5);
    expect(p50).toBeGreaterThanOrEqual(10);
    expect(p50).toBeLessThanOrEqual(50);
  });

  it('centroids stay bounded under heavy input', () => {
    const small = new CentroidDigest({ centroids: 20 });
    for (let i = 0; i < 5_000; i++) small.observe(Math.random() * 1000);
    expect(small.centroidCount).toBeLessThanOrEqual(40); // ≤2K
    expect(small.count).toBe(5_000);
  });

  it('rank estimates the CDF', () => {
    for (let i = 1; i <= 100; i++) d.observe(i);
    expect(d.rank(0)).toBe(0);
    expect(d.rank(200)).toBe(1);
    const mid = d.rank(50);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });

  it('empty digest yields NaN quantiles', () => {
    expect(d.quantile(0.5)).toBeNaN();
    expect(d.rank(5)).toBeNaN();
  });

  it('rejects out-of-range quantiles', () => {
    d.observe(1);
    expect(() => d.quantile(-0.1)).toThrow();
    expect(() => d.quantile(1.1)).toThrow();
  });

  it('single-value digest returns that value for all quantiles', () => {
    d.observe(42);
    expect(d.quantile(0)).toBe(42);
    expect(d.quantile(1)).toBe(42);
  });

  it('duplicate values merge into shared centroids', () => {
    const tight = new CentroidDigest({ centroids: 5 });
    for (let i = 0; i < 100; i++) tight.observe(7);
    // All values identical → one growing centroid, not 5 singletons.
    expect(tight.centroidCount).toBeLessThanOrEqual(5);
    expect(tight.quantile(0.5)).toBeCloseTo(7, 6);
  });
});

describe('SamplingProfiler', () => {
  it('tracks metrics independently', () => {
    const p = new SamplingProfiler({ reservoirSize: 10, centroids: 10 });
    p.observe('latency', 100);
    p.observe('latency', 200);
    p.observe('errors', 1);
    expect(p.sample('latency').length).toBe(2);
    expect(p.sample('errors').length).toBe(1);
    expect(p.metrics().sort()).toEqual(['errors', 'latency']);
  });

  it('summary aggregates percentiles and sample mean', () => {
    const p = new SamplingProfiler({ reservoirSize: 100, centroids: 50 });
    for (let i = 1; i <= 100; i++) p.observe('m', i);
    const s = p.summary('m')!;
    expect(s.count).toBe(100);
    expect(s.min).toBe(1);
    expect(s.max).toBe(100);
    expect(s.p50).toBeGreaterThan(25);
    expect(s.p50).toBeLessThan(75);
    expect(s.sampleMean).toBeCloseTo(50.5, 0);
  });

  it('unknown metric yields NaN quantile and undefined summary', () => {
    const p = new SamplingProfiler();
    expect(p.quantile('ghost', 0.5)).toBeNaN();
    expect(p.summary('ghost')).toBeUndefined();
    expect(p.sample('ghost')).toEqual([]);
  });

  it('large streams stay bounded but track the extremes', () => {
    const p = new SamplingProfiler({ reservoirSize: 50, centroids: 32 });
    for (let i = 0; i < 50_000; i++) p.observe('big', i);
    const s = p.summary('big')!;
    expect(s.count).toBe(50_000);
    expect(s.min).toBe(0);
    expect(s.max).toBe(49_999);
    expect(p.sample('big').length).toBeLessThanOrEqual(50);
    expect(p.digestOf('big')!.centroidCount).toBeLessThanOrEqual(64);
  });
});
