/**
 * Canary Deploy — Multi-Metric Combined Verdict
 *
 * Fuses per-metric comparisons (error rate + latency + saturation + any
 * custom metric) into one {@link CombinedVerdict} with a health score.
 *
 * Algorithm
 * ---------
 * Samples are kept in per-(metric, cohort) bounded buffers. On `evaluate`,
 * each metric is aggregated into a {@link MetricWindow} over a trailing
 * `windowMs` slice (mean/stddev/percentiles computed by sorted quantile —
 * O(n log n) per evaluation, buffers are small by design).
 *
 * Per-metric verdict:
 *   - 'insufficient' — canary has fewer than `minSamples` observations;
 *     the metric is excluded from the score and the combined verdict is
 *     capped at 'insufficient-data' unless at least one metric produced a
 *     real verdict.
 *   - 'fail' — canary exceeds the tolerance bound (absolute when set,
 *     else live × (1 ± relative)). For error-rate metrics the compared
 *     quantity is `errorRate` rather than `mean` — see `errorMetrics`.
 *   - 'degraded' — canary is worse than live but inside tolerance.
 *   - 'pass' — canary ≥ live (for lower-is-worse: canary ≤ live).
 *
 * Deviation normalization: the fractional amount of the tolerance budget
 * consumed, in [-1,+1]. +1 = exactly at live parity for higher-is-worse;
 * 0 = at the bound; negative = past the bound (clamped at -1).
 *
 * Combined score = 1 − Σ(weightᵢ × max(0, -deviationᵢ... penalty)),
 * implemented as weighted mean of per-metric scores where
 * scoreᵢ = clamp(1 + deviationᵢ, 0, 1) for passing/degraded metrics and
 * 0 for failed metrics. Status mapping:
 *   any fail            → 'unhealthy'
 *   all insufficient    → 'insufficient-data'
 *   any degraded        → 'degraded'
 *   else                → 'healthy'
 *
 * @module CanaryDeploy/Engine2
 */

import {
  CombinedVerdict,
  Engine2Clock,
  MetricContribution,
  MetricSample,
  MetricTolerance,
  MetricWindow,
} from './CanaryEngine2Types';

/** Default cap on retained samples per (metric, cohort). */
const DEFAULT_MAX_SAMPLES = 10_000;

/** Nearest-rank percentile over a sorted array. */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

export class MultiMetricAnalyzer {
  private readonly _clock: Engine2Clock;
  private readonly _tolerances: ReadonlyArray<MetricTolerance>;
  /** Metrics whose compared quantity is errorRate (fraction ≥ threshold). */
  private readonly _errorMetrics = new Set<string>();
  private readonly _errorThresholds = new Map<string, number>();
  private readonly _samples = new Map<string, MetricSample[]>();
  private readonly _maxSamples: number;
  private readonly _windowMs: number;

  constructor(
    tolerances: ReadonlyArray<MetricTolerance>,
    options: {
      clock?: Engine2Clock;
      /** Trailing window for aggregation (ms). Default 60_000. */
      windowMs?: number;
      /** Metrics to compare by error rate rather than mean. */
      errorMetrics?: ReadonlyArray<{ metric: string; errorThreshold?: number }>;
      maxSamples?: number;
    } = {}
  ) {
    if (tolerances.length === 0) throw new Error('at least one metric tolerance required');
    for (const t of tolerances) {
      if (t.weight <= 0) throw new RangeError(`metric '${t.metric}' weight must be positive`);
      if (t.relative < 0) throw new RangeError(`metric '${t.metric}' relative tolerance must be ≥ 0`);
    }
    this._tolerances = tolerances;
    this._clock = options.clock ?? Date.now;
    this._windowMs = options.windowMs ?? 60_000;
    this._maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
    for (const e of options.errorMetrics ?? []) {
      this._errorMetrics.add(e.metric);
      this._errorThresholds.set(e.metric, e.errorThreshold ?? 1);
    }
  }

  /** Record one observation. */
  record(sample: MetricSample): void {
    const key = `${sample.metric}:${sample.cohort}`;
    let buf = this._samples.get(key);
    if (!buf) {
      buf = [];
      this._samples.set(key, buf);
    }
    buf.push(sample);
    if (buf.length > this._maxSamples) {
      buf.splice(0, buf.length - this._maxSamples);
    }
  }

  /** Aggregate a cohort's samples for one metric over the trailing window. */
  aggregate(metric: string, cohort: 'live' | 'canary', windowEnd?: number): MetricWindow {
    const end = windowEnd ?? this._clock();
    const start = end - this._windowMs;
    const buf = this._samples.get(`${metric}:${cohort}`) ?? [];
    const inWindow = buf.filter((s) => s.at > start && s.at <= end);
    const values = inWindow.map((s) => s.value).sort((a, b) => a - b);
    const n = values.length;
    const mean = n === 0 ? 0 : values.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0;
    const errThreshold = this._errorThresholds.get(metric) ?? 1;
    const errors = values.filter((v) => v >= errThreshold).length;
    return {
      metric,
      cohort,
      windowStart: start,
      windowEnd: end,
      count: n,
      mean,
      stddev: Math.sqrt(variance),
      min: n === 0 ? 0 : values[0],
      max: n === 0 ? 0 : values[n - 1],
      errorRate: n === 0 ? 0 : errors / n,
      p50: quantile(values, 0.5),
      p95: quantile(values, 0.95),
      p99: quantile(values, 0.99),
    };
  }

  /** The quantity compared for a metric — errorRate or mean. */
  private _quantity(metric: string, w: MetricWindow): number {
    return this._errorMetrics.has(metric) ? w.errorRate : w.mean;
  }

  /**
   * Produce the fused verdict for the trailing window ending at `at`
   * (defaults to clock-now).
   */
  evaluate(at?: number): CombinedVerdict {
    const now = at ?? this._clock();
    const contributions: MetricContribution[] = [];
    const failing: string[] = [];
    const insufficient: string[] = [];
    let weighted = 0;
    let totalWeight = 0;
    let anyRealVerdict = false;
    let anyDegraded = false;

    for (const tol of this._tolerances) {
      const canary = this.aggregate(tol.metric, 'canary', now);
      const live = this.aggregate(tol.metric, 'live', now);

      if (canary.count < tol.minSamples) {
        insufficient.push(tol.metric);
        contributions.push({
          metric: tol.metric,
          canary,
          live,
          verdict: 'insufficient',
          deviation: 0,
          reason: `only ${canary.count}/${tol.minSamples} canary samples`,
        });
        continue;
      }
      anyRealVerdict = true;

      const cVal = this._quantity(tol.metric, canary);
      const lVal = this._quantity(tol.metric, live);

      // Compute the allowed bound and normalize deviation into [-1,+1].
      let bound: number;
      if (tol.absolute !== undefined) {
        bound = tol.absolute;
      } else if (tol.direction === 'higher-is-worse') {
        bound = lVal * (1 + tol.relative);
      } else {
        bound = lVal * (1 - tol.relative);
      }
      // Span between live value and bound — guards against live=0.
      const span = Math.abs(bound - lVal);
      const raw =
        tol.direction === 'higher-is-worse' ? bound - cVal : cVal - bound;
      // raw > 0 inside budget, < 0 over budget.
      let deviation: number;
      if (raw >= 0) {
        // Inside budget: deviation ∈ (0, +1] approaching +1 at parity.
        const parityRoom = tol.direction === 'higher-is-worse' ? bound - lVal : lVal - bound;
        deviation = parityRoom > 0 ? Math.min(1, (raw / parityRoom)) : 1;
      } else {
        deviation = span > 0 ? Math.max(-1, raw / span) : (raw < 0 ? -1 : 0);
      }

      let verdict: MetricContribution['verdict'];
      let reason: string;
      if (raw < 0) {
        verdict = 'fail';
        failing.push(tol.metric);
        reason =
          tol.direction === 'higher-is-worse'
            ? `canary ${cVal.toFixed(4)} exceeds bound ${bound.toFixed(4)} (live ${lVal.toFixed(4)})`
            : `canary ${cVal.toFixed(4)} below bound ${bound.toFixed(4)} (live ${lVal.toFixed(4)})`;
      } else if (
        (tol.direction === 'higher-is-worse' && cVal > lVal) ||
        (tol.direction === 'lower-is-worse' && cVal < lVal)
      ) {
        verdict = 'degraded';
        anyDegraded = true;
        reason = `canary ${cVal.toFixed(4)} worse than live ${lVal.toFixed(4)} but within tolerance`;
      } else {
        verdict = 'pass';
        reason = `canary ${cVal.toFixed(4)} at or better than live ${lVal.toFixed(4)}`;
      }

      contributions.push({ metric: tol.metric, canary, live, verdict, deviation, reason });
      const score = verdict === 'fail' ? 0 : Math.max(0, Math.min(1, 1 + deviation));
      weighted += tol.weight * score;
      totalWeight += tol.weight;
    }

    const score = totalWeight > 0 ? weighted / totalWeight : 0;
    let status: CombinedVerdict['status'];
    let reason: string;
    if (failing.length > 0) {
      status = 'unhealthy';
      reason = `failing metrics: ${failing.join(', ')}`;
    } else if (!anyRealVerdict) {
      status = 'insufficient-data';
      reason = `insufficient samples on all metrics (${insufficient.join(', ')})`;
    } else if (anyDegraded) {
      status = 'degraded';
      reason = 'one or more metrics degraded within tolerance';
    } else {
      status = 'healthy';
      reason = 'all metrics at or better than live';
    }

    return {
      at: now,
      status,
      score,
      contributions,
      failingMetrics: failing,
      insufficientMetrics: insufficient,
      reason,
    };
  }

  /** Drop all samples (e.g. between rollout stages). */
  reset(): void {
    this._samples.clear();
  }
}
