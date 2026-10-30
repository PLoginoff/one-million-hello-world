/**
 * Chaos Experiment Result Analyzer
 *
 * Compares steady-state metric samples collected BEFORE a fault was
 * injected (baseline window) with samples collected DURING the fault, and
 * decides whether the hypothesis "the system remained in steady state"
 * statistically held.
 *
 * The comparison uses Welch's two-sample t-test:
 *
 *        meanA - meanB
 *   t = ---------------------------
 *        sqrt(sA²/nA + sB²/nB)
 *
 * with Welch–Satterthwaite degrees of freedom
 *
 *        (sA²/nA + sB²/nB)²
 *   df = ---------------------------------------
 *        (sA²/nA)²/(nA-1) + (sB²/nB)²/(nB-1)
 *
 * and a two-tailed p-value approximated from the incomplete beta
 * function. Unlike a z-test, Welch's t-test does not assume equal
 * variances nor equal sample sizes — which matters in practice because
 * chaos windows are typically shorter and noisier than baselines.
 *
 * For small samples the analyzer also reports an effect size (Cohen's d
 * with pooled standard deviation) so operators can distinguish
 * "statistically significant but negligible" from "actually broken".
 *
 * Each analyzed sample series produces an independent metric verdict;
 * the overall hypothesis verdict uses a configurable conjunction policy
 * (all metrics must hold by default — the strict option real chaos
 * frameworks take).
 *
 * Complexity: O(n) per metric series; the beta-function approximation is
 * O(iterations) where iterations ≤ ~200 (Lanczos-continued fraction).
 *
 * @module ChaosEngineering/Engine2
 */

/** A single numeric observation bound to a phase. */
export interface PhaseSample {
  readonly value: number;
  readonly at: number;
}

/** Phase discriminator for a collected observation. */
export type SampleWindow = 'baseline' | 'during' | 'recovery';

/** One metric's observations, partitioned by experiment window. */
export interface MetricSeries {
  readonly metric: string;
  readonly baseline: readonly PhaseSample[];
  readonly during: readonly PhaseSample[];
  /** Optional post-rollback samples — used to verify the system recovered. */
  readonly recovery?: readonly PhaseSample[];
}

/** Direction of the tolerated deviation, mirroring the experiment hypothesis. */
export enum DeviationDirection {
  /** Metric must not exceed baseline (e.g. latency, error-rate). */
  INCREASE_IS_BAD = 'increase-is-bad',
  /** Metric must not fall below baseline (e.g. throughput, availability). */
  DECREASE_IS_BAD = 'decrease-is-bad',
  /** Any statistically significant drift counts as a violation. */
  ANY_DRIFT = 'any-drift',
}

/** Descriptive statistics for one window of samples. */
export interface WindowStats {
  readonly n: number;
  readonly mean: number;
  /** Sample variance (Bessel-corrected, n-1). */
  readonly variance: number;
  readonly stddev: number;
  readonly min: number;
  readonly max: number;
}

/** Result of comparing baseline vs during for one metric. */
export interface MetricComparison {
  readonly metric: string;
  readonly baseline: WindowStats;
  readonly during: WindowStats;
  /** Welch's t statistic; NaN when there is no variance at all. */
  readonly tStatistic: number;
  /** Welch–Satterthwaite degrees of freedom. */
  readonly degreesOfFreedom: number;
  /** Two-tailed p-value in [0, 1]; direction is handled via `directionalPValue`. */
  readonly pValue: number;
  /** One-tailed p-value for the hypothesised bad direction. */
  readonly directionalPValue: number;
  /**
   * Confidence that a bad-direction deviation exists, in [0, 1] — i.e.
   * `1 - directionalPValue`. Low when the metric plausibly held steady.
   */
  readonly confidence: number;
  /**
   * Cohen's d — standardised mean difference using pooled variance.
   * |d| < 0.2 trivial, 0.2 small, 0.5 medium, 0.8+ large.
   */
  readonly effectSize: number;
  /** Absolute mean shift (during - baseline). */
  readonly meanShift: number;
  /** Relative mean shift as fraction of baseline mean; NaN if baseline mean is 0. */
  readonly relativeShift: number;
  /** True when the metric held steady at the required confidence. */
  readonly steady: boolean;
  readonly reason: string;
}

/** Whether the system recovered after the fault was rolled back. */
export interface RecoveryAssessment {
  readonly metric: string;
  readonly recovered: boolean;
  readonly reason: string;
  /** Comparison of recovery window vs baseline. */
  readonly comparison?: MetricComparison;
}

/** Policy controlling how individual metric verdicts combine. */
export enum VerdictPolicy {
  /** Hypothesis holds iff EVERY metric held steady (strict). */
  ALL = 'all',
  /** Hypothesis holds iff at least one metric held (lenient). */
  ANY = 'any',
  /** Holds iff ≥ quorum fraction of metrics held. */
  QUORUM = 'quorum',
}

/** Aggregated result for an entire experiment. */
export interface ExperimentAnalysis {
  readonly comparisons: readonly MetricComparison[];
  readonly hypothesisHeld: boolean;
  /** Combined confidence = max deviation confidence across metrics. */
  readonly confidence: number;
  /** The metric that deviated most, for the report headline. */
  readonly worstMetric?: MetricComparison;
  readonly recovery: readonly RecoveryAssessment[];
  readonly summary: string;
}

/** Raised when analysis input is degenerate (e.g. < 2 samples per window). */
export class AnalysisInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisInputError';
  }
}

/* ------------------------------------------------------------------------ */
/* Statistics internals                                                      */
/* ------------------------------------------------------------------------ */

function windowStats(samples: readonly PhaseSample[]): WindowStats {
  const n = samples.length;
  if (n === 0) {
    return { n: 0, mean: 0, variance: 0, stddev: 0, min: 0, max: 0 };
  }
  // Welford online accumulation — numerically stable, single pass O(n).
  let mean = 0;
  let m2 = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const s of samples) {
    count++;
    const d = s.value - mean;
    mean += d / count;
    m2 += d * (s.value - mean);
    if (s.value < min) min = s.value;
    if (s.value > max) max = s.value;
  }
  const variance = n > 1 ? m2 / (n - 1) : 0;
  return { n, mean, variance, stddev: Math.sqrt(variance), min, max };
}

/**
 * Log-gamma via Lanczos approximation (g = 7, 9 terms).
 * Accurate to ~1e-14 — standard Numerical Recipes coefficients.
 */
function logGamma(z: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    // Reflection formula: Γ(z)Γ(1-z) = π / sin(πz)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const t = z - 1;
  let x = c[0];
  for (let i = 1; i < c.length; i++) x += c[i] / (t + i);
  const u = t + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (t + 0.5) * Math.log(u) - u + Math.log(x);
}

/**
 * Regularized incomplete beta function I_x(a, b) via the continued
 * fraction expansion (Lentz's method). Used for the t-distribution CDF.
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Symmetry trick: evaluate the *smaller* side. When x is large the
  // direct continued fraction converges slowly, so swap (a,b) and use
  // 1-x — the swap must happen BEFORE computing the fraction.
  let aa = a;
  let bb = b;
  let xx = x;
  let swapped = false;
  if (x > (a + 1) / (a + b + 2)) {
    aa = b;
    bb = a;
    xx = 1 - x;
    swapped = true;
  }
  const lbeta = logGamma(aa + bb) - logGamma(aa) - logGamma(bb);
  const front = Math.exp(lbeta + aa * Math.log(xx) + bb * Math.log(1 - xx));
  const f = betacf(aa, bb, xx);
  const val = (front / aa) * f;
  return swapped ? 1 - val : val;
}

/** Continued fraction for I_x — Lentz's method (Numerical Recipes betacf). */
function betacf(a: number, b: number, x: number): number {
  const MAX_ITER = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let coef = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + coef * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + coef / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    coef = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + coef * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + coef / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Two-tailed p-value for Welch's t with df degrees of freedom. */
export function tTwoTailedP(t: number, df: number): number {
  if (df <= 0 || !Number.isFinite(t)) return Number.isNaN(t) ? 1 : 0;
  const x = df / (df + t * t);
  // P(|T| ≥ |t|) = I_{df/(df+t²)}(df/2, 1/2) for the two-tailed case.
  return Math.min(1, Math.max(0, incompleteBeta(x, df / 2, 0.5)));
}

/** Pooled standard deviation for Cohen's d. */
function pooledStddev(a: WindowStats, b: WindowStats): number {
  const nA = a.n;
  const nB = b.n;
  if (nA + nB - 2 <= 0) return 0;
  return Math.sqrt(((nA - 1) * a.variance + (nB - 1) * b.variance) / (nA + nB - 2));
}

/* ------------------------------------------------------------------------ */
/* Analyzer                                                                 */
/* ------------------------------------------------------------------------ */

export interface ExperimentAnalyzerConfig {
  /** Minimum confidence in [0,1] required for a metric to count as steady. */
  readonly minConfidence: number;
  /** Minimum samples required in each window before testing. */
  readonly minSamples: number;
  /** How individual verdicts combine into the experiment verdict. */
  readonly policy: VerdictPolicy;
  /** Fraction for QUORUM policy. */
  readonly quorumFraction: number;
  /**
   * Optional practical-significance floor: even when p is small, if the
   * relative mean shift is below this fraction the metric is still
   * considered steady ("significant but irrelevant" filter).
   */
  readonly minRelativeShift: number;
  /** Direction assumed per metric when not specified on the series. */
  readonly defaultDirection: DeviationDirection;
}

export const DEFAULT_ANALYZER_CONFIG: ExperimentAnalyzerConfig = {
  minConfidence: 0.95,
  minSamples: 3,
  policy: VerdictPolicy.ALL,
  quorumFraction: 0.66,
  minRelativeShift: 0,
  defaultDirection: DeviationDirection.INCREASE_IS_BAD,
};

/** Optional per-metric metadata. */
export interface AnalyzedSeries extends MetricSeries {
  readonly direction?: DeviationDirection;
}

/**
 * ExperimentResultAnalyzer — statistical before/during comparison.
 */
export class ExperimentResultAnalyzer {
  private readonly _config: ExperimentAnalyzerConfig;

  constructor(config: Partial<ExperimentAnalyzerConfig> = {}) {
    this._config = { ...DEFAULT_ANALYZER_CONFIG, ...config };
  }

  get config(): ExperimentAnalyzerConfig {
    return this._config;
  }

  /**
   * Compare one metric's baseline vs during windows.
   * Throws AnalysisInputError when either window has < minSamples.
   */
  compareSeries(series: AnalyzedSeries): MetricComparison {
    const base = windowStats(series.baseline);
    const dur = windowStats(series.during);
    const cfg = this._config;
    if (base.n < cfg.minSamples || dur.n < cfg.minSamples) {
      throw new AnalysisInputError(
        `metric '${series.metric}': need ≥${cfg.minSamples} samples per window ` +
          `(baseline=${base.n}, during=${dur.n})`
      );
    }

    const direction = series.direction ?? cfg.defaultDirection;
    const sA2n = base.variance / base.n;
    const sB2n = dur.variance / dur.n;
    const se2 = sA2n + sB2n;

    let t: number;
    let df: number;
    let pTwo: number;
    if (se2 === 0) {
      // No variance in either window: t is degenerate.
      t = base.mean === dur.mean ? 0 : Number.POSITIVE_INFINITY;
      df = base.n + dur.n - 2;
      pTwo = base.mean === dur.mean ? 1 : 0;
    } else {
      t = (base.mean - dur.mean) / Math.sqrt(se2);
      const num = se2 * se2;
      const den = (sA2n * sA2n) / (base.n - 1) + (sB2n * sB2n) / (dur.n - 1);
      df = den === 0 ? base.n + dur.n - 2 : num / den;
      pTwo = tTwoTailedP(t, df);
    }

    // Directional p: half the two-tailed mass on the "bad" side.
    // When the shift ran the *good* way the deviation can't be a breach,
    // so the bad-direction p-value collapses to ~0.
    const meanShift = dur.mean - base.mean;
    let directionalP: number;
    switch (direction) {
      case DeviationDirection.INCREASE_IS_BAD:
        directionalP = meanShift > 0 ? pTwo / 2 : 1 - pTwo / 2;
        break;
      case DeviationDirection.DECREASE_IS_BAD:
        directionalP = meanShift < 0 ? pTwo / 2 : 1 - pTwo / 2;
        break;
      case DeviationDirection.ANY_DRIFT:
      default:
        directionalP = pTwo;
        break;
    }
    // `confidence` = confidence that a bad deviation exists = 1 - p_bad.
    const confidence = 1 - directionalP;

    const pooled = pooledStddev(base, dur);
    const effectSize = pooled === 0 ? (meanShift === 0 ? 0 : Number.POSITIVE_INFINITY) : meanShift / pooled;
    const relativeShift = base.mean === 0 ? (meanShift === 0 ? 0 : Number.NaN) : meanShift / Math.abs(base.mean);

    // A deviation is established when confidence ≥ minConfidence — i.e.
    // when directionalP < 1 - minConfidence.
    const significant = confidence >= cfg.minConfidence;
    const practicallyRelevant =
      cfg.minRelativeShift > 0 &&
      Number.isFinite(relativeShift) &&
      Math.abs(relativeShift) < cfg.minRelativeShift;
    const steady = !significant || practicallyRelevant;

    const reason = steady
      ? `no significant deviation (p=${directionalP.toFixed(4)}, shift=${meanShift.toFixed(4)})`
      : `significant deviation (confidence=${(confidence * 100).toFixed(1)}% ≥ ` +
        `${(cfg.minConfidence * 100).toFixed(0)}%, shift=${meanShift.toFixed(4)}, ` +
        `d=${effectSize.toFixed(2)})`;

    return {
      metric: series.metric,
      baseline: base,
      during: dur,
      tStatistic: t,
      degreesOfFreedom: df,
      pValue: pTwo,
      directionalPValue: directionalP,
      confidence,
      effectSize,
      meanShift,
      relativeShift,
      steady,
      reason,
    };
  }

  /**
   * Assess whether a recovery window returned to baseline after rollback.
   * Returns null when no recovery samples were provided.
   */
  assessRecovery(series: AnalyzedSeries): RecoveryAssessment | null {
    if (series.recovery === undefined || series.recovery.length === 0) return null;
    const synthetic: AnalyzedSeries = {
      metric: series.metric,
      baseline: series.baseline,
      during: series.recovery,
      direction: DeviationDirection.ANY_DRIFT,
    };
    let comparison: MetricComparison | undefined;
    try {
      comparison = this.compareSeries(synthetic);
    } catch (e) {
      if (e instanceof AnalysisInputError) {
        return { metric: series.metric, recovered: false, reason: e.message };
      }
      throw e;
    }
    const recovered = comparison.steady;
    return {
      metric: series.metric,
      recovered,
      reason: recovered ? 'returned to baseline' : `still deviating: ${comparison.reason}`,
      comparison,
    };
  }

  /**
   * Full experiment analysis over all metric series.
   * Series with too few samples are reported as non-steady with a
   * descriptive reason (rather than throwing) — the caller decides.
   */
  analyze(seriesList: readonly AnalyzedSeries[]): ExperimentAnalysis {
    const comparisons: MetricComparison[] = [];
    const recovery: RecoveryAssessment[] = [];
    const skipped: string[] = [];

    for (const s of seriesList) {
      try {
        comparisons.push(this.compareSeries(s));
      } catch (e) {
        if (e instanceof AnalysisInputError) {
          skipped.push(`${s.metric}: ${e.message}`);
          comparisons.push({
            metric: s.metric,
            baseline: windowStats(s.baseline),
            during: windowStats(s.during),
            tStatistic: Number.NaN,
            degreesOfFreedom: 0,
            pValue: Number.NaN,
            directionalPValue: Number.NaN,
            // Insufficient evidence either way — treated as a violation
            // with maximal deviation confidence so the report errs safe.
            confidence: 1,
            effectSize: Number.NaN,
            meanShift: Number.NaN,
            relativeShift: Number.NaN,
            steady: false,
            reason: `insufficient data: ${e.message}`,
          });
        } else {
          throw e;
        }
      }
      const rec = this.assessRecovery(s);
      if (rec !== null) recovery.push(rec);
    }

    const held = this._combine(comparisons);
    const confidence =
      comparisons.length === 0 ? 0 : Math.max(...comparisons.map((c) => c.confidence));

    let worst: MetricComparison | undefined;
    for (const c of comparisons) {
      if (worst === undefined || c.confidence > worst.confidence) worst = c;
    }

    const passCount = comparisons.filter((c) => c.steady).length;
    const parts = [
      `${passCount}/${comparisons.length} metrics steady`,
      comparisons.length > 0 ? `confidence=${(confidence * 100).toFixed(1)}%` : 'no metrics',
    ];
    if (worst !== undefined && !worst.steady) {
      parts.push(`worst=${worst.metric} (${worst.reason})`);
    }
    if (skipped.length > 0) parts.push(`skipped: ${skipped.join('; ')}`);

    return {
      comparisons,
      hypothesisHeld: held,
      confidence,
      worstMetric: worst,
      recovery,
      summary: parts.join(', '),
    };
  }

  private _combine(comparisons: readonly MetricComparison[]): boolean {
    if (comparisons.length === 0) return false;
    switch (this._config.policy) {
      case VerdictPolicy.ANY:
        return comparisons.some((c) => c.steady);
      case VerdictPolicy.QUORUM: {
        const need = Math.ceil(comparisons.length * this._config.quorumFraction);
        return comparisons.filter((c) => c.steady).length >= need;
      }
      case VerdictPolicy.ALL:
      default:
        return comparisons.every((c) => c.steady);
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Convenience: convert raw probe verdicts into a decision                   */
/* ------------------------------------------------------------------------ */

/**
 * Build a human-readable operator report from an analysis — the kind of
 * text a real chaos report (Gremlin/Chaos Toolkit style) surfaces.
 */
export function formatAnalysisReport(analysis: ExperimentAnalysis): string {
  const lines: string[] = [
    `Hypothesis held: ${analysis.hypothesisHeld ? 'YES' : 'NO'} ` +
      `(max deviation confidence ${(analysis.confidence * 100).toFixed(1)}%)`,
    `Summary: ${analysis.summary}`,
    '',
    'Metric details:',
  ];
  for (const c of analysis.comparisons) {
    lines.push(
      `  ${c.metric}: baseline μ=${c.baseline.mean.toFixed(4)} σ=${c.baseline.stddev.toFixed(4)} ` +
        `(n=${c.baseline.n}) → during μ=${c.during.mean.toFixed(4)} σ=${c.during.stddev.toFixed(4)} ` +
        `(n=${c.during.n}) | t=${c.tStatistic.toFixed(3)} df=${c.degreesOfFreedom.toFixed(1)} ` +
        `p=${c.pValue.toFixed(4)} d=${c.effectSize.toFixed(2)} → ${c.steady ? 'STEADY' : 'VIOLATED'}`
    );
    lines.push(`    ${c.reason}`);
  }
  if (analysis.recovery.length > 0) {
    lines.push('', 'Recovery:');
    for (const r of analysis.recovery) {
      lines.push(`  ${r.metric}: ${r.recovered ? 'RECOVERED' : 'DEGRADED'} — ${r.reason}`);
    }
  }
  return lines.join('\n');
}
