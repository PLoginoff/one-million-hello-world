/**
 * BaselineRegression
 *
 * Compares a current load-test run against a stored baseline and flags
 * statistically significant regressions using Welch's t-test on raw
 * latency samples plus effect-size (Cohen's d) and relative-delta
 * thresholds.
 *
 * A regression is reported when BOTH conditions hold:
 *   - the metric moved in the bad direction beyond `minRelativeDelta`
 *     (default 5%), AND
 *   - Welch's t-test rejects equality at `alpha` (default 0.05).
 *
 * Requiring both guards against noise-flagging on small samples and
 * trivial-but-significant shifts on huge samples — the same dual-criteria
 * approach used by performance-CI tooling.
 *
 * @module PerformanceTesting/Engine
 */

import { welchTTest, LatencySnapshot } from './Metrics';
import { LoadTestReport } from './LoadEngine';

/* ------------------------------------------------------------------------ */
/* Baseline                                                                 */
/* ------------------------------------------------------------------------ */

/** Persisted baseline for a workload profile. */
export interface PerformanceBaseline {
  readonly name: string;
  readonly capturedAt: number;
  readonly latency: LatencySnapshot;
  /** Raw samples when available — enables proper Welch testing. */
  readonly samples: readonly number[];
  readonly avgThroughput: number;
  readonly errorRate: number;
  readonly totalRequests: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Capture a baseline from a completed report. */
export function captureBaseline(
  name: string,
  report: LoadTestReport,
  metadata?: Record<string, string>
): PerformanceBaseline {
  return {
    name,
    capturedAt: Date.now(),
    latency: report.latency,
    samples: report.samples,
    avgThroughput: report.avgThroughput,
    errorRate: report.errorRate,
    totalRequests: report.totalRequests,
    metadata,
  };
}

/* ------------------------------------------------------------------------ */
/* Comparison                                                               */
/* ------------------------------------------------------------------------ */

export type RegressionVerdict = 'improved' | 'stable' | 'regressed' | 'insufficient-data';

export interface MetricComparison {
  readonly metric: string;
  readonly baseline: number;
  readonly current: number;
  /** (current - baseline) / baseline */
  readonly relativeDelta: number;
  /** Welch's t-test p-value (when samples available). */
  readonly pValue?: number;
  /** Cohen's d effect size (when samples available). */
  readonly effectSize?: number;
  readonly verdict: RegressionVerdict;
}

export interface RegressionReport {
  readonly baselineName: string;
  readonly significant: boolean;
  readonly comparisons: readonly MetricComparison[];
  readonly regressions: readonly MetricComparison[];
  readonly summary: string;
}

export interface CompareOptions {
  /** Two-tailed significance level for Welch's t-test. Default 0.05. */
  readonly alpha?: number;
  /** Relative change below which a metric is 'stable'. Default 0.05. */
  readonly minRelativeDelta?: number;
  /** Direction per metric: higher-is-worse for latency/errors. */
  readonly worseWhenHigher?: Readonly<Record<string, boolean>>;
}

const DEFAULT_WORSE_WHEN_HIGHER: Readonly<Record<string, boolean>> = {
  'latency.p50': true,
  'latency.p95': true,
  'latency.p99': true,
  'latency.mean': true,
  'errors.rate': true,
  'throughput.avg': false,
};

/**
 * Compare a current report against a baseline.
 */
export class BaselineComparator {
  constructor(private readonly _options: CompareOptions = {}) {}

  compare(current: LoadTestReport, baseline: PerformanceBaseline): RegressionReport {
    const alpha = this._options.alpha ?? 0.05;
    const minDelta = this._options.minRelativeDelta ?? 0.05;
    const worseHigh = { ...DEFAULT_WORSE_WHEN_HIGHER, ...this._options.worseWhenHigher };

    const metrics: { name: string; base: number; curr: number }[] = [
      { name: 'latency.p50', base: baseline.latency.p50, curr: current.latency.p50 },
      { name: 'latency.p95', base: baseline.latency.p95, curr: current.latency.p95 },
      { name: 'latency.p99', base: baseline.latency.p99, curr: current.latency.p99 },
      { name: 'latency.mean', base: baseline.latency.mean, curr: current.latency.mean },
      { name: 'errors.rate', base: baseline.errorRate, curr: current.errorRate },
      { name: 'throughput.avg', base: baseline.avgThroughput, curr: current.avgThroughput },
    ];

    const comparisons: MetricComparison[] = metrics.map((m) => {
      const relDelta =
        m.base === 0 ? (m.curr === 0 ? 0 : Infinity) : (m.curr - m.base) / m.base;
      // samples-based stats only for the latency family
      let pValue: number | undefined;
      let effect: number | undefined;
      const latencyMetric = m.name.startsWith('latency.');
      if (latencyMetric && baseline.samples.length >= 2 && current.samples.length >= 2) {
        const wt = welchTTest(current.samples, baseline.samples);
        pValue = wt.pValue;
        effect = cohensD(current.samples, baseline.samples);
      }
      const worse = worseHigh[m.name] ?? true;
      const movedBad = worse ? relDelta > minDelta : relDelta < -minDelta;
      const movedGood = worse ? relDelta < -minDelta : relDelta > minDelta;
      let verdict: RegressionVerdict;
      if (pValue !== undefined && Number.isNaN(pValue)) {
        verdict = 'insufficient-data';
      } else if (movedBad && (pValue === undefined || pValue < alpha)) {
        verdict = 'regressed';
      } else if (movedGood && (pValue === undefined || pValue < alpha)) {
        verdict = 'improved';
      } else {
        verdict = 'stable';
      }
      return {
        metric: m.name,
        baseline: m.base,
        current: m.curr,
        relativeDelta: relDelta,
        pValue,
        effectSize: effect,
        verdict,
      };
    });

    const regressions = comparisons.filter((c) => c.verdict === 'regressed');
    const significant = regressions.length > 0;
    const summary = significant
      ? `REGRESSION vs "${baseline.name}": ${regressions
          .map((r) => `${r.metric} ${(r.relativeDelta * 100).toFixed(1)}%`)
          .join(', ')}`
      : `no significant regression vs "${baseline.name}"`;

    return { baselineName: baseline.name, significant, comparisons, regressions, summary };
  }
}

/** Cohen's d — pooled-SD effect size. */
export function cohensD(a: readonly number[], b: readonly number[]): number {
  const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  const varr = (xs: readonly number[], m: number): number =>
    xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1);
  const ma = mean(a);
  const mb = mean(b);
  const pooled = Math.sqrt(
    ((a.length - 1) * varr(a, ma) + (b.length - 1) * varr(b, mb)) /
      Math.max(1, a.length + b.length - 2)
  );
  return pooled === 0 ? 0 : (ma - mb) / pooled;
}

/* ------------------------------------------------------------------------ */
/* Baseline store                                                           */
/* ------------------------------------------------------------------------ */

/**
 * In-memory baseline registry keyed by workload name — the analog of
 * persisted `.perf/baselines/*.json` artifacts in CI pipelines.
 */
export class BaselineStore {
  private readonly _baselines = new Map<string, PerformanceBaseline[]>();

  save(baseline: PerformanceBaseline): void {
    const arr = this._baselines.get(baseline.name) ?? [];
    arr.push(baseline);
    this._baselines.set(baseline.name, arr);
  }

  latest(name: string): PerformanceBaseline | undefined {
    const arr = this._baselines.get(name);
    return arr?.[arr.length - 1];
  }

  history(name: string): readonly PerformanceBaseline[] {
    return [...(this._baselines.get(name) ?? [])];
  }

  names(): readonly string[] {
    return [...this._baselines.keys()];
  }
}
