/**
 * Baseline regression tests — capture, compare, significance.
 */

import { describe, it, expect } from 'bun:test';
import {
  captureBaseline,
  BaselineComparator,
  BaselineStore,
  cohensD,
  LoadEngine,
  LoadSchedule,
  mulberry32,
} from '../engine/index';
import type { LoadTestReport } from '../engine/index';

/** Helper: synthesize a report with given latency samples. */
function fakeReport(samples: number[], avgRps = 100, errorRate = 0): LoadTestReport {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return {
    durationMs: 1000,
    totalRequests: samples.length,
    totalErrors: Math.round(errorRate * samples.length),
    latency: {
      count: samples.length,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      mean: samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length),
      p50: pick(50),
      p90: pick(90),
      p95: pick(95),
      p99: pick(99),
    },
    peakThroughput: avgRps,
    avgThroughput: avgRps,
    errorRate,
    errorsByClass: new Map(),
    thresholdResults: [],
    passed: true,
    aborted: false,
    timeline: [],
    samples,
    recentErrors: [],
  };
}

const gaussian = (seed: number, mean: number, sd: number, n: number): number[] => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => {
    // Box-Muller
    const u1 = r() || 1e-9;
    const u2 = r();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  });
};

describe('captureBaseline / BaselineStore', () => {
  it('round-trips baselines', () => {
    const report = fakeReport(gaussian(1, 100, 10, 200));
    const base = captureBaseline('checkout', report, { commit: 'abc' });
    expect(base.latency.p50).toBeCloseTo(report.latency.p50, 5);
    expect(base.samples).toHaveLength(200);

    const store = new BaselineStore();
    store.save(base);
    expect(store.latest('checkout')?.name).toBe('checkout');
    store.save(captureBaseline('checkout', fakeReport(gaussian(2, 110, 10, 200))));
    expect(store.history('checkout')).toHaveLength(2);
    expect(store.names()).toEqual(['checkout']);
  });
});

describe('BaselineComparator', () => {
  const comparator = new BaselineComparator();

  it('flags a real latency regression', () => {
    const base = captureBaseline('svc', fakeReport(gaussian(1, 100, 10, 300)));
    const current = fakeReport(gaussian(2, 140, 10, 300)); // +40%
    const report = comparator.compare(current, base);
    expect(report.significant).toBe(true);
    const p99 = report.comparisons.find((c) => c.metric === 'latency.p99');
    expect(p99?.verdict).toBe('regressed');
    expect(p99?.relativeDelta).toBeGreaterThan(0.05);
    expect(p99?.pValue).toBeLessThan(0.05);
  });

  it('stays stable on same-distribution runs', () => {
    const base = captureBaseline('svc', fakeReport(gaussian(1, 100, 10, 300)));
    const current = fakeReport(gaussian(2, 100.5, 10, 300));
    const report = comparator.compare(current, base);
    expect(report.significant).toBe(false);
    expect(report.regressions).toHaveLength(0);
  });

  it('detects improvement', () => {
    const base = captureBaseline('svc', fakeReport(gaussian(1, 100, 10, 300)));
    const current = fakeReport(gaussian(2, 70, 10, 300)); // -30%
    const report = comparator.compare(current, base);
    const mean = report.comparisons.find((c) => c.metric === 'latency.mean');
    expect(mean?.verdict).toBe('improved');
  });

  it('throughput regression uses lower-is-worse direction', () => {
    const base = captureBaseline('svc', fakeReport(gaussian(1, 100, 10, 100), 500));
    const current = fakeReport(gaussian(1, 100, 10, 100), 300); // -40% rps
    const report = comparator.compare(current, base);
    const tp = report.comparisons.find((c) => c.metric === 'throughput.avg');
    expect(tp?.verdict).toBe('regressed');
  });

  it('requires minRelativeDelta even when significant', () => {
    const comparator5pct = new BaselineComparator({ minRelativeDelta: 0.05 });
    const base = captureBaseline('svc', fakeReport(gaussian(1, 100, 10, 5000)));
    const current = fakeReport(gaussian(2, 101, 10, 5000)); // +1% — under delta
    const report = comparator5pct.compare(current, base);
    expect(report.significant).toBe(false);
  });
});

describe('cohensD', () => {
  it('large effect for separated distributions', () => {
    const a = gaussian(1, 100, 10, 200);
    const b = gaussian(2, 140, 10, 200);
    expect(Math.abs(cohensD(a, b))).toBeGreaterThan(2);
  });
  it('near zero for identical distributions', () => {
    const a = gaussian(1, 100, 10, 200);
    const b = gaussian(2, 100.2, 10, 200);
    expect(Math.abs(cohensD(a, b))).toBeLessThan(0.2);
  });
});

describe('end-to-end: engine → baseline → regression', () => {
  it('compares two real engine runs', async () => {
    const mk = (latencyShift: number): Promise<LoadTestReport> =>
      new LoadEngine({
        schedule: LoadSchedule.constant(10, 2000),
        scenarios: [
          {
            name: 's',
            weight: 1,
            execute: (() => {
              const r = mulberry32(latencyShift * 17 + 1);
              return () => latencyShift + r() * 20;
            })(),
          },
        ],
        seed: 9,
      }).run();

    const before = await mk(50);
    const after = await mk(300);
    const base = captureBaseline('e2e', before);
    const report = new BaselineComparator().compare(after, base);
    expect(report.significant).toBe(true);
  });
});
