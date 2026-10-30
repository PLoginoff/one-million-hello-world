/**
 * engine2 anomaly scorer + cardinality guard tests.
 */

import { describe, it, expect } from 'bun:test';
import { CardinalityGuard, median, SeasonalAnomalyScorer } from '../../engine2';

const HOUR = 3_600_000;

describe('median', () => {
  it('handles odd/even/empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('SeasonalAnomalyScorer', () => {
  it('ignores series below minSamples', () => {
    const s = new SeasonalAnomalyScorer({ minSamples: 10, seasonal: false });
    const r = s.ingest('cpu', 999, 0);
    expect(r.anomalous).toBe(false);
    expect(r.samples).toBe(0);
  });

  it('flags a spike after a stable baseline', () => {
    const s = new SeasonalAnomalyScorer({ minSamples: 10, seasonal: false, threshold: 3.5 });
    // Baseline: ~50 with tiny wiggle.
    for (let i = 0; i < 50; i++) s.learn('cpu', 50 + (i % 3) - 1, i * 1000);
    const spike = s.score('cpu', 200, 51_000);
    expect(spike.anomalous).toBe(true);
    expect(spike.median).toBeCloseTo(50, 0);
    const normal = s.score('cpu', 51, 51_000);
    expect(normal.anomalous).toBe(false);
  });

  it('MAD stays robust: one prior outlier does not mask the next', () => {
    const s = new SeasonalAnomalyScorer({ minSamples: 5, seasonal: false });
    for (let i = 0; i < 20; i++) s.learn('m', 10, i);
    s.learn('m', 10_000, 100); // prior outlier in baseline
    const r = s.score('m', 9_000, 101);
    expect(r.anomalous).toBe(true); // MAD ≈ 0 still catches it
  });

  it('seasonal buckets isolate hour-of-week behaviour', () => {
    const s = new SeasonalAnomalyScorer({ minSamples: 3, seasonal: true });
    const hour0 = 0; // Monday 00:00
    const hour1 = HOUR; // Monday 01:00 — a different seasonal slot
    for (let i = 0; i < 10; i++) s.learn('load', 100, hour0 + i * 7 * 24 * HOUR);
    // 10 samples at hour 0 across weeks; now a huge value at hour 1
    // (a slot with no baseline) is not anomalous.
    const r = s.score('load', 100_000, hour1);
    expect(r.anomalous).toBe(false);
    expect(r.samples).toBe(0);
    // But a huge value at hour 0 *is*.
    expect(s.score('load', 100_000, hour0 + 11 * 7 * 24 * HOUR).anomalous).toBe(true);
  });

  it('bounds per-bucket memory', () => {
    const s = new SeasonalAnomalyScorer({ minSamples: 1, seasonal: false, maxSamplesPerBucket: 10 });
    for (let i = 0; i < 100; i++) s.learn('m', i, i);
    const r = s.score('m', 50, 200);
    expect(r.samples).toBeLessThanOrEqual(10);
  });
});

describe('CardinalityGuard', () => {
  it('admits distinct series up to the bound', () => {
    const g = new CardinalityGuard(2);
    expect(g.admit('m', { a: '1' })).toEqual({ a: '1' });
    expect(g.admit('m', { a: '2' })).toEqual({ a: '2' });
    const third = g.admit('m', { a: '3' });
    expect(third).toEqual({ __cardinality__: 'overflow' });
    expect(g.overflowedCount()).toBe(1);
  });

  it('repeat series always admitted', () => {
    const g = new CardinalityGuard(1);
    g.admit('m', { a: '1' });
    expect(g.admit('m', { a: '1' })).toEqual({ a: '1' });
    expect(g.seriesCount('m')).toBe(1);
  });

  it('per-metric budgets are independent', () => {
    const g = new CardinalityGuard(1);
    g.admit('a', { x: '1' });
    g.admit('b', { x: '2' });
    expect(g.seriesCount('a')).toBe(1);
    expect(g.seriesCount('b')).toBe(1);
  });
});
