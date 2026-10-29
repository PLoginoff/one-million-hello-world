/**
 * ThroughputTracker tests — sliding window rates, reservoir percentiles.
 */

import { describe, it, expect } from 'bun:test';
import { ThroughputTracker } from '../pattern/ThroughputTracker';

describe('ThroughputTracker', () => {
  it('computes per-second rates over the window', () => {
    const t = new ThroughputTracker(60, 100, () => 0.5);
    const base = 60_000;
    for (let i = 0; i < 30; i++) {
      t.recordProcessed(5, base + i * 1_000); // 1/sec for 30s
    }
    const r = t.rates(base + 30_000);
    expect(r.processedPerSec).toBeGreaterThan(0.5);
    expect(r.processedPerSec).toBeLessThanOrEqual(1.2);
    expect(r.totalProcessed).toBe(30);
  });

  it('window eviction drops old buckets', () => {
    const t = new ThroughputTracker(10);
    t.recordProcessed(1, 0);
    t.recordProcessed(1, 20_000); // 20s later — bucket 0 evicted
    const r = t.rates(20_000);
    expect(r.processedPerSec).toBe(1); // only the recent one counts in rate
    expect(r.totalProcessed).toBe(2);  // totals keep full history
  });

  it('latency percentiles over reservoir', () => {
    const t = new ThroughputTracker(60, 1_000, () => 0.99);
    for (let i = 1; i <= 100; i++) t.recordProcessed(i, i * 1_000);
    const r = t.rates(100_000);
    expect(r.p50).toBeGreaterThanOrEqual(49);
    expect(r.p50).toBeLessThanOrEqual(51);
    expect(r.p95).toBeGreaterThanOrEqual(94);
    expect(r.p99).toBeGreaterThanOrEqual(98);
  });

  it('reservoir stays bounded under flood', () => {
    const t = new ThroughputTracker(60, 50, () => 0.42);
    for (let i = 0; i < 10_000; i++) t.recordProcessed(i, i);
    expect(t.rates(10_000).p50).toBeGreaterThanOrEqual(0);
  });

  it('failure and parked counters tracked separately', () => {
    const t = new ThroughputTracker(60);
    t.recordFailure(0);
    t.recordParked(0);
    const r = t.rates(1_000);
    expect(r.totalFailed).toBe(1);
    expect(r.totalParked).toBe(1);
  });
});
