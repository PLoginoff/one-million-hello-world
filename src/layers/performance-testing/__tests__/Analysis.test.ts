/**
 * Analysis module tests — distribution analysis, capacity, rendering, trends.
 */

import { describe, it, expect } from 'bun:test';
import {
  LatencyAnalyzer,
  CapacityEstimator,
  ReportRenderer,
  TrendTracker,
  LoadEngine,
  LoadSchedule,
  mulberry32,
} from '../engine/index';
import type { LoadTestReport } from '../engine/index';

describe('LatencyAnalyzer', () => {
  it('computes distribution stats over samples', () => {
    const r = mulberry32(1);
    const samples = Array.from({ length: 500 }, () => 50 + r() * 100);
    const a = LatencyAnalyzer.analyze(samples);
    expect(a.count).toBe(500);
    expect(a.min).toBeGreaterThanOrEqual(50);
    expect(a.max).toBeLessThanOrEqual(150);
    expect(a.mean).toBeGreaterThan(90);
    expect(a.mean).toBeLessThan(110);
    expect(a.p99).toBeGreaterThan(a.median);
    expect(a.stddev).toBeGreaterThan(0);
    expect(a.tailRatio).toBeGreaterThan(1);
    expect(a.outlierFraction).toBeLessThan(0.05);
  });

  it('handles empty', () => {
    const a = LatencyAnalyzer.analyze([]);
    expect(a.count).toBe(0);
    expect(Number.isNaN(a.mean)).toBe(true);
  });
});

describe('CapacityEstimator', () => {
  it('applies Little\'s law projections', async () => {
    const report = await new LoadEngine({
      schedule: LoadSchedule.constant(10, 2000),
      scenarios: [{ name: 's', weight: 1, execute: () => 50 }],
      seed: 1,
    }).run();
    const est = CapacityEstimator.estimate(report);
    // 10 users × (1000ms/50ms) = 200rps ceiling
    expect(est.maxThroughputAt(10)).toBeCloseTo(200, 0);
    expect(est.concurrencyFor(100)).toBeCloseTo(5, 0);
    expect(est.observedThroughput).toBeGreaterThan(0);
  });
});

describe('ReportRenderer', () => {
  it('renders a k6-style summary', async () => {
    const report = await new LoadEngine({
      schedule: LoadSchedule.ramp(10, 500, 2000, 500),
      scenarios: [{ name: 's', weight: 1, execute: () => 30 }],
      thresholds: [{ metric: 'latency.p99', op: '<', value: 500 }],
      seed: 2,
    }).run();
    const text = ReportRenderer.render(report);
    expect(text).toContain('LOAD TEST');
    expect(text).toContain('p99');
    expect(text).toContain('thresholds:');
    expect(text).toContain('users');
    expect(ReportRenderer.oneLine(report)).toContain('rps');
  });
});

describe('TrendTracker', () => {
  const fakeReport = (p95: number): LoadTestReport => ({
    durationMs: 1000, totalRequests: 100, totalErrors: 0,
    latency: { count: 100, min: 1, max: 2 * p95, mean: p95 * 0.7, p50: p95 * 0.8, p90: p95 * 0.95, p95, p99: p95 * 1.1 },
    peakThroughput: 100, avgThroughput: 100, errorRate: 0,
    errorsByClass: new Map(), thresholdResults: [], passed: true, aborted: false,
    timeline: [], samples: [], recentErrors: [],
  });

  it('computes regression slope over points', () => {
    const t = new TrendTracker();
    [100, 105, 110, 115, 120].forEach((p) => t.add(fakeReport(p)));
    expect(t.slope('p95')).toBeCloseTo(5, 1);
    expect(t.isDegrading('p95', 1)).toBe(true);
  });

  it('flat trend is not degrading', () => {
    const t = new TrendTracker();
    [100, 100, 100, 100].forEach((p) => t.add(fakeReport(p)));
    expect(t.isDegrading('p95', 0.1)).toBe(false);
    expect(t.slope('p95')).toBeCloseTo(0, 1);
  });
});
