/**
 * Deep coverage for SlidingWindowAggregator: bucket-boundary math,
 * ring wrap-around, aggregate semantics, sparkline edges, top-N
 * eviction policy and prune lifecycle.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SlidingWindowAggregator } from '../SlidingWindowAggregator';
import { ManualAnalyticsClock2 } from '../types';

describe('bucket boundary semantics', () => {
  let clock: ManualAnalyticsClock2;
  let agg: SlidingWindowAggregator;

  beforeEach(() => {
    clock = new ManualAnalyticsClock2(0);
    agg = new SlidingWindowAggregator({ bucketMs: 1_000, windowMs: 10_000, clock });
  });

  it('a point exactly on a bucket edge lands in that bucket', () => {
    agg.record({ metric: 'm', timestamp: 5_000 });
    const s = agg.sparkline('m', 'count', 3, 6_000);
    // buckets 3,4,5 -> [null, null, 1]
    expect(s.buckets.map((b) => b.value)).toEqual([null, null, 1]);
  });

  it('window end is exclusive: points at end are outside', () => {
    agg.record({ metric: 'm', timestamp: 10_000 });
    const a = agg.aggregate('m', 'count', 10_000);
    // 10_000 is the exclusive end — the point belongs to a bucket
    // inside [0, 10_000)? bucket 10 is at edge; lastIdx = floor(9999/1000) = 9
    expect(a.value).toBe(0);
    const later = agg.aggregate('m', 'count', 11_000);
    expect(later.value).toBe(1);
  });

  it('window start boundary: bucket straddling the edge is included whole', () => {
    agg.record({ metric: 'm', timestamp: 999 }); // bucket 0
    agg.record({ metric: 'm', timestamp: 10_000 }); // bucket 10
    const a = agg.aggregate('m', 'count', 11_000);
    // window = [1000, 11000); firstIdx = ceil(1000/1000) = 1, lastIdx = 10
    // bucket 0 (holding the t=999 point) is excluded; bucket 10 included
    expect(a.value).toBe(1);
  });

  it('fractional window start rounds up to whole buckets', () => {
    agg.record({ metric: 'm', timestamp: 500 }); // bucket 0
    agg.record({ metric: 'm', timestamp: 1_500 }); // bucket 1
    // window end 11_500 → start 1_500 → firstIdx = ceil(1.5) = 2
    // lastIdx = floor(11_499/1000) = 11 → buckets 2..11 → only... none live
    const a = agg.aggregate('m', 'count', 11_500);
    expect(a.value).toBe(0);
    // and at end 11_001 → start 1_001 → firstIdx = 2, still excludes bucket 1
    expect(agg.aggregate('m', 'count', 11_001).value).toBe(0);
    // at end 11_000 → start 1_000 → firstIdx = 1, includes bucket 1
    expect(agg.aggregate('m', 'count', 11_000).value).toBe(1);
  });
});

describe('ring wrap-around and generation reset', () => {
  it('old generations do not leak through reused slots', () => {
    // windowMs 3_000, bucketMs 1_000 → slots = 4
    const clock = new ManualAnalyticsClock2(0);
    const agg = new SlidingWindowAggregator({ bucketMs: 1_000, windowMs: 3_000, clock });
    // Fill bucket 0 with count 5.
    for (let i = 0; i < 5; i++) agg.record({ metric: 'm', timestamp: 100 });
    // Bucket index 4 reuses slot 0 (4 % 4 == 0). Write there.
    agg.record({ metric: 'm', timestamp: 4_500 });
    // Window [2_000, 5_000): buckets 2..4 — only the new-gen point counts.
    const a = agg.aggregate('m', 'count', 5_000);
    expect(a.value).toBe(1);
  });

  it('interleaved generations across all slots stay independent', () => {
    const clock = new ManualAnalyticsClock2(0);
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 300, clock });
    // slots = 4. Write one point into buckets 0..7 (two full generations).
    for (let i = 0; i < 8; i++) {
      agg.record({ metric: 'm', timestamp: i * 100 + 10 });
    }
    // Window ending at 800: [500, 800) → buckets 5,6,7 → 3 points.
    expect(agg.aggregate('m', 'count', 800).value).toBe(3);
    // Sparkline buckets 4..7 → [1 (old gen, still valid), 1, 1, 1]
    const s = agg.sparkline('m', 'count', 4, 800);
    expect(s.buckets.map((b) => b.value)).toEqual([1, 1, 1, 1]);
  });

  it('min/max survive across generation boundaries', () => {
    const clock = new ManualAnalyticsClock2(0);
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 400, clock });
    agg.record({ metric: 'm', value: -50, timestamp: 10 }); // gen 0, slot 0
    agg.record({ metric: 'm', value: 7, timestamp: 510 }); // gen 5, slot 1? (5 % 5 = 0)
    const a = agg.aggregate('m', 'min', 1_000);
    // window [600, 1000): buckets 6..9 — gen-5 point at bucket 5 excluded
    expect(a.value).toBeNaN();
    const b = agg.aggregate('m', 'min', 910);
    // window [510, 910): buckets 6..9 — still excluded (bucket 5 < 6)
    expect(b.value).toBeNaN();
    const c = agg.aggregate('m', 'min', 900);
    // window [500, 900): buckets 5..8 → includes bucket 5 → min 7
    expect(c.value).toBe(7);
  });
});

describe('aggregate semantics', () => {
  let agg: SlidingWindowAggregator;

  beforeEach(() => {
    agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
  });

  it('count ignores point values (each point = 1)', () => {
    agg.record({ metric: 'm', value: 999, timestamp: 10 });
    agg.record({ metric: 'm', timestamp: 20 });
    expect(agg.aggregate('m', 'count', 1_000).value).toBe(2);
  });

  it('sum defaults missing values to 1', () => {
    agg.record({ metric: 'm', value: 10, timestamp: 10 });
    agg.record({ metric: 'm', timestamp: 20 });
    expect(agg.aggregate('m', 'sum', 1_000).value).toBe(11);
  });

  it('avg weights every sample equally across buckets', () => {
    // 3 points of 10 in bucket 0, 1 point of 30 in bucket 1.
    for (let i = 0; i < 3; i++) agg.record({ metric: 'm', value: 10, timestamp: 10 });
    agg.record({ metric: 'm', value: 30, timestamp: 110 });
    expect(agg.aggregate('m', 'avg', 1_000).value).toBe(15);
  });

  it('negative values track min/max correctly', () => {
    agg.record({ metric: 'm', value: -5, timestamp: 10 });
    agg.record({ metric: 'm', value: -100, timestamp: 110 });
    agg.record({ metric: 'm', value: 3, timestamp: 210 });
    expect(agg.aggregate('m', 'min', 1_000).value).toBe(-100);
    expect(agg.aggregate('m', 'max', 1_000).value).toBe(3);
    expect(agg.aggregate('m', 'sum', 1_000).value).toBe(-102);
  });

  it('samples count matches points, not buckets', () => {
    for (let i = 0; i < 7; i++) agg.record({ metric: 'm', timestamp: 50 });
    const a = agg.aggregate('m', 'count', 1_000);
    expect(a.samples).toBe(7);
    expect(a.value).toBe(7);
  });

  it('windowStart/windowEnd echo the query range', () => {
    const a = agg.aggregate('m', 'count', 50_000);
    expect(a.windowEnd).toBe(50_000);
    expect(a.windowStart).toBe(49_000);
  });
});

describe('sparkline edges', () => {
  it('points beyond the live window still appear in sparklines', () => {
    // Sparkline reads raw buckets — a stale-but-resident bucket shows.
    const clock = new ManualAnalyticsClock2(0);
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 200, clock });
    agg.record({ metric: 'm', timestamp: 0 });
    agg.record({ metric: 'm', timestamp: 500 });
    const s = agg.sparkline('m', 'count', 6, 600);
    // buckets 0..5 → [1, null, null, null, null, 1]
    expect(s.buckets[0]!.value).toBe(1);
    expect(s.buckets[5]!.value).toBe(1);
  });

  it('sparkline bucket start times align to bucketMs grid', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 250, windowMs: 2_500 });
    const s = agg.sparkline('m', 'count', 4, 1_234);
    // lastIdx = floor(1233/250) = 4 → buckets 1..4 → starts 250,500,750,1000
    expect(s.buckets.map((b) => b.start)).toEqual([250, 500, 750, 1_000]);
  });

  it('min/max sparkline kinds emit per-bucket stats', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
    agg.record({ metric: 'm', value: 5, timestamp: 10 });
    agg.record({ metric: 'm', value: 9, timestamp: 20 });
    agg.record({ metric: 'm', value: 1, timestamp: 110 });
    const sMin = agg.sparkline('m', 'min', 3, 300);
    const sMax = agg.sparkline('m', 'max', 3, 300);
    expect(sMin.buckets.map((b) => b.value)).toEqual([5, 1, null]);
    expect(sMax.buckets.map((b) => b.value)).toEqual([9, 1, null]);
  });
});

describe('topN details', () => {
  it('n=0 returns empty entries but keeps totals', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
    agg.hit('l', 'a');
    const t = agg.topN('l', 0);
    expect(t.entries).toEqual([]);
    expect(t.total).toBe(1);
  });

  it('tie counts sort by key ascending', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
    for (const k of ['z', 'm', 'a']) {
      agg.hit('l', k);
      agg.hit('l', k);
    }
    const t = agg.topN('l', 3);
    expect(t.entries.map((e) => e.key)).toEqual(['a', 'm', 'z']);
  });

  it('shares sum to ~1 across the full list', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
    agg.hit('l', 'a');
    agg.hit('l', 'a');
    agg.hit('l', 'a');
    agg.hit('l', 'b');
    const t = agg.topN('l', 10);
    const sum = t.entries.reduce((s, e) => s + e.share, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('evicted key re-entering starts fresh at 1', () => {
    const agg = new SlidingWindowAggregator({
      bucketMs: 100,
      windowMs: 1_000,
      maxDimensions: 2,
    });
    agg.hit('l', 'x');
    agg.hit('l', 'y');
    agg.hit('l', 'y');
    agg.hit('l', 'z'); // evicts x
    agg.hit('l', 'x'); // re-enters at 1
    const t = agg.topN('l', 10);
    const x = t.entries.find((e) => e.key === 'x');
    expect(x?.count).toBe(1);
    expect(t.total).toBe(5);
  });

  it('separate lists do not interfere', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
    agg.hit('pages', '/a');
    agg.hit('referrers', 'google');
    agg.hit('referrers', 'google');
    expect(agg.topN('pages', 5).entries[0]!.key).toBe('/a');
    expect(agg.topN('referrers', 5).entries[0]!.count).toBe(2);
  });
});

describe('prune and lifecycle', () => {
  it('prune is a no-op for live metrics', () => {
    const clock = new ManualAnalyticsClock2(0);
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000, clock });
    agg.record({ metric: 'a', timestamp: 900 });
    expect(agg.prune(1_000)).toBe(0);
    expect(agg.metrics()).toContain('a');
  });

  it('a metric at the exact cutoff edge survives', () => {
    const clock = new ManualAnalyticsClock2(0);
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000, clock });
    agg.record({ metric: 'edge', timestamp: 100 }); // bucket 1
    // cutoff = floor((1100 - 1000) / 100) = 1 → newestIndex 1 not < 1
    expect(agg.prune(1_100)).toBe(0);
    clock.set(1_200); // cutoff = 2 > newestIndex 1
    expect(agg.prune()).toBe(1);
  });

  it('metrics() lists all rings ever written, in insertion order', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
    agg.record({ metric: 'z', timestamp: 0 });
    agg.record({ metric: 'a', timestamp: 0 });
    expect(agg.metrics()).toEqual(['z', 'a']);
  });

  it('clear() wipes rings and dimension lists', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
    agg.record({ metric: 'm', timestamp: 0 });
    agg.hit('l', 'k');
    agg.clear();
    expect(agg.metrics()).toEqual([]);
    expect(agg.topN('l', 5).total).toBe(0);
    expect(agg.aggregate('m', 'count', 1_000).value).toBe(0);
  });

  it('huge windows keep bounded memory via slot reuse', () => {
    const clock = new ManualAnalyticsClock2(0);
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000, clock });
    // Write 100k points across 100k buckets — the ring only holds 11.
    for (let i = 0; i < 100_000; i++) {
      agg.record({ metric: 'm', timestamp: i * 100 });
    }
    // Window [9_999_001, 10_000_001) → buckets 99991..100000;
    // writes covered buckets up to 99999 → 9 live buckets.
    const a = agg.aggregate('m', 'count', 100_000 * 100 + 1);
    expect(a.value).toBe(9);
  });
});
