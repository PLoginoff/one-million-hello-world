/**
 * Analysis — load-test result analysis and reporting
 *
 * Post-run analysis tools:
 *
 *  - {@link LatencyAnalyzer}: distribution breakdown over raw samples —
 *    percentiles, jitter (stddev of first differences), outlier counts
 *    beyond N sigma, tail-ratio analysis (p99/p50).
 *  - {@link CapacityEstimator}: Little's Law analysis — given observed
 *    concurrency (VUs) and latency, estimates theoretical max throughput
 *    and the concurrency ceiling for a target latency.
 *  - {@link ReportRenderer}: k6-style text summary (checks, metrics,
 *    timeline sparkline) for CI logs.
 *  - {@link TrendTracker}: stores run summaries and computes
 *    trends across N runs — catches slow drift that single
 *    baseline comparisons miss.
 *
 * @module PerformanceTesting/Engine
 */

import { LoadTestReport, TimelinePoint } from './LoadEngine';
import { LatencySnapshot } from './Metrics';

/* ------------------------------------------------------------------------ */
/* Latency analysis                                                         */
/* ------------------------------------------------------------------------ */

export interface DistributionAnalysis {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
  readonly stddev: number;
  /** p99 / p50 — tail heaviness; >> 1 means heavy tail. */
  readonly tailRatio: number;
  /** Mean absolute first-difference — jitter. */
  readonly jitter: number;
  /** Fraction of samples > mean + 3*stddev. */
  readonly outlierFraction: number;
}

/** Full distribution analysis over raw samples. */
export class LatencyAnalyzer {
  /**
   * Analyze raw latency samples (completion order, as recorded by the
   * engine — preserves temporal structure for jitter).
   */
  static analyze(samples: readonly number[]): DistributionAnalysis {
    const n = samples.length;
    if (n === 0) {
      return {
        count: 0, min: NaN, max: NaN, mean: NaN, median: NaN,
        p90: NaN, p95: NaN, p99: NaN, stddev: NaN,
        tailRatio: NaN, jitter: NaN, outlierFraction: NaN,
      };
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const varr = samples.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1);
    const stddev = Math.sqrt(varr);
    const pick = (p: number): number =>
      sorted[Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1))];
    const p50 = pick(50);
    const p99 = pick(99);
    let jitter = 0;
    for (let i = 1; i < n; i++) jitter += Math.abs(samples[i] - samples[i - 1]);
    jitter = n > 1 ? jitter / (n - 1) : 0;
    const cutoff = mean + 3 * stddev;
    const outliers = samples.filter((x) => x > cutoff).length;
    return {
      count: n,
      min: sorted[0],
      max: sorted[n - 1],
      mean,
      median: p50,
      p90: pick(90),
      p95: pick(95),
      p99,
      stddev,
      tailRatio: p50 === 0 ? NaN : p99 / p50,
      jitter,
      outlierFraction: outliers / n,
    };
  }
}

/* ------------------------------------------------------------------------ */
/* Capacity estimation (Little's Law)                                       */
/* ------------------------------------------------------------------------ */

export interface CapacityEstimate {
  /** Observed: avg concurrent requests in flight. */
  readonly observedConcurrency: number;
  /** Observed throughput (req/sec). */
  readonly observedThroughput: number;
  /** Observed mean latency (ms). */
  readonly meanLatencyMs: number;
  /**
   * Estimated max throughput at N concurrent users: min(N / latency,
   * observed * N/concurrency) — Little's law L = λW solved for λ.
   */
  maxThroughputAt(users: number): number;
  /**
   * Estimated concurrency needed to hit `targetRps` at current latency.
   */
  concurrencyFor(targetRps: number): number;
  /**
   * Estimated latency when scaled to `users` VUs assuming service time
   * stays constant (queueing ignored — optimistic bound).
   */
  projectedLatencyMs(users: number): number;
}

/**
 * Little's Law capacity model: L = λ·W.
 *
 * Given a report's observed concurrency (peak active users), throughput
 * and mean latency, derives the implied service capacity and projects
 * how scaling VUs moves throughput/latency.
 */
export class CapacityEstimator {
  static estimate(report: LoadTestReport): CapacityEstimate {
    const peakUsers = Math.max(1, ...report.timeline.map((t) => t.activeUsers));
    const throughput = report.avgThroughput; // rps
    const latencySec = Math.max(1e-3, report.latency.mean / 1000);
    const concurrency = throughput * latencySec; // Little's law L
    const serviceCapacity = peakUsers / latencySec; // max λ before queueing

    return {
      observedConcurrency: concurrency,
      observedThroughput: throughput,
      meanLatencyMs: report.latency.mean,
      maxThroughputAt: (users: number) =>
        Math.min(users / latencySec, serviceCapacity),
      concurrencyFor: (targetRps: number) => targetRps * latencySec,
      projectedLatencyMs: (users: number) => {
        // utilization = λ/(users/service) — beyond ~80% latency balloons;
        // simple M/M/1-style inflation factor for illustration.
        const utilization = Math.min(0.99, (throughput * latencySec) / Math.max(1, users));
        return (report.latency.mean * 1) / Math.max(0.01, 1 - utilization * 0.5);
      },
    };
  }
}

/* ------------------------------------------------------------------------ */
/* Report rendering                                                         */
/* ------------------------------------------------------------------------ */

const SPARK = '▁▂▃▄▅▆▇█';

function sparkline(values: readonly number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v) => SPARK[Math.min(SPARK.length - 1, Math.floor(((v - min) / range) * SPARK.length))])
    .join('');
}

/**
 * Render a k6-style plain-text summary of a load test — the artifact
 * CI logs consume.
 */
export class ReportRenderer {
  static render(report: LoadTestReport): string {
    const l: string[] = [];
    const lat: LatencySnapshot = report.latency;

    l.push('╔══════════════════════════════════════════════════════════╗');
    l.push(`║  LOAD TEST ${report.passed ? 'PASSED' : 'FAILED'}${report.aborted ? ' (ABORTED)' : ''}`.padEnd(60) + '║');
    l.push('╚══════════════════════════════════════════════════════════╝');
    l.push('');
    l.push(`duration      : ${(report.durationMs / 1000).toFixed(1)}s`);
    l.push(`requests      : ${report.totalRequests} (${report.avgThroughput.toFixed(1)}/s, peak ${report.peakThroughput.toFixed(1)}/s)`);
    l.push(`errors        : ${report.totalErrors} (${(report.errorRate * 100).toFixed(2)}%)`);
    l.push('');
    l.push('latency:');
    l.push(`  min ${lat.min.toFixed(1)}ms  mean ${lat.mean.toFixed(1)}ms  max ${lat.max.toFixed(1)}ms`);
    l.push(`  p50 ${lat.p50.toFixed(1)}ms  p90 ${lat.p90.toFixed(1)}ms  p95 ${lat.p95.toFixed(1)}ms  p99 ${lat.p99.toFixed(1)}ms`);
    l.push('');
    if (report.errorsByClass.size > 0) {
      l.push('errors by class:');
      for (const [k, v] of report.errorsByClass) l.push(`  ${k}: ${v}`);
      l.push('');
    }
    if (report.thresholdResults.length > 0) {
      l.push('thresholds:');
      for (const t of report.thresholdResults) {
        const mark = t.ok ? '✓' : '✗';
        l.push(`  ${mark} ${t.threshold.metric} ${t.threshold.op} ${t.threshold.value}  (observed ${t.observed.toFixed(2)})`);
      }
      l.push('');
    }
    if (report.timeline.length > 1) {
      l.push('load timeline:');
      l.push(`  users ${sparkline(report.timeline.map((t) => t.activeUsers))}`);
      l.push(`  reqs  ${sparkline(report.timeline.map((t) => t.requests))}`);
      l.push(`  errs  ${sparkline(report.timeline.map((t) => t.errors))}`);
    }
    if (report.abortReason) {
      l.push(`\naborted: ${report.abortReason}`);
    }
    return l.join('\n');
  }

  /** Compact one-line summary for CI status. */
  static oneLine(report: LoadTestReport): string {
    return (
      `${report.passed ? 'PASS' : 'FAIL'} ${report.totalRequests}req ` +
      `${report.avgThroughput.toFixed(0)}rps p95=${report.latency.p95.toFixed(0)}ms ` +
      `err=${(report.errorRate * 100).toFixed(1)}%`
    );
  }
}

/* ------------------------------------------------------------------------ */
/* Trend tracking                                                           */
/* ------------------------------------------------------------------------ */

export interface TrendPoint {
  readonly at: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly throughput: number;
  readonly errorRate: number;
}

/**
 * Tracks run summaries over time and detects drift.
 * Trend = linear regression slope over the metric per run —
 * positive slope on latency = degrading performance.
 */
export class TrendTracker {
  private readonly _points: TrendPoint[] = [];

  add(report: LoadTestReport, at = Date.now()): void {
    this._points.push({
      at,
      p50: report.latency.p50,
      p95: report.latency.p95,
      p99: report.latency.p99,
      throughput: report.avgThroughput,
      errorRate: report.errorRate,
    });
  }

  points(): readonly TrendPoint[] {
    return [...this._points];
  }

  /**
   * Linear-regression slope of a metric over stored points —
   * positive = degrading for latency metrics.
   * Returns NaN with <2 points.
   */
  slope(metric: keyof Omit<TrendPoint, 'at'>): number {
    const xs = this._points.map((p, i) => i);
    const ys = this._points.map((p) => p[metric]);
    const n = xs.length;
    if (n < 2) return NaN;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }

  /**
   * Whether the trend indicates degradation: positive slope on
   * latency metrics beyond `threshold` per run.
   */
  isDegrading(metric: keyof Omit<TrendPoint, 'at'> = 'p95', threshold = 0): boolean {
    const s = this.slope(metric);
    return !Number.isNaN(s) && s > threshold;
  }
}
