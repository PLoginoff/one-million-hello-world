/**
 * AbTestingEngine — deterministic variant assignment + Welch's t-test.
 *
 * Assignment: FNV-1a hash of `experimentId:subjectId` mapped into
 * `[0,1)` and walked across cumulative variant weights. Properties:
 *   - deterministic — same (experiment, subject) always gets the same
 *     variant, no coordination or storage needed;
 *   - weight-consistent — raising variant B's weight only moves
 *     subjects whose bucket falls into the newly-added range; everyone
 *     else keeps their assignment (no mass re-bucketing on config
 *     change, unlike modulo hashing);
 *   - uniform — for enough distinct subjects the split converges to
 *     the configured proportions.
 *
 * Conversion tracking: per-variant counters for exposures and
 * conversions; conversion rate = conversions/exposures.
 *
 * Significance: Welch's two-sample t-test for *proportions* using the
 * Bernoulli variance p(1-p) — the standard "is B actually better than
 * the control" test for conversion rates:
 *
 *   t = (p1 − p2) / sqrt( p1(1−p1)/n1 + p2(1−p2)/n2 )
 *
 * Welch (rather than Student) is used because variant sample sizes
 * differ by design. The returned p-value uses the normal
 * approximation, which is accurate for the n typical in A/B tests
 * (hundreds+); callers wanting exact Student-t tails should export
 * the t statistic and df.
 *
 * Complexity: assign O(#variants); record O(1); significance O(1).
 *
 * @module StrategyLayer/Engine
 */

import {
  ExperimentNotFoundError,
  fnv1a32,
  StrategyEngineClock,
  SystemEngineClock,
  UnknownVariantError,
} from './types';

export interface VariantDef {
  name: string;
  /** Relative weight; proportions are normalized across variants. */
  weight: number;
  /** Free-form payload the caller attaches (config blob). */
  payload?: unknown;
}

export interface ExperimentDef {
  id: string;
  name?: string;
  variants: readonly VariantDef[];
  /** Fraction of subjects eligible at all (0..1); rest get `null`. Default 1. */
  coverage?: number;
  /** True while the experiment accepts assignments. Default true. */
  enabled?: boolean;
}

export interface VariantStats {
  variant: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
}

export interface SignificanceResult {
  control: string;
  challenger: string;
  controlRate: number;
  challengerRate: number;
  /** Relative uplift: (chall − ctrl) / ctrl. */
  uplift: number;
  tStatistic: number;
  /** Welch–Satterthwaite degrees of freedom. */
  degreesOfFreedom: number;
  /** Two-sided p-value (normal approximation). */
  pValue: number;
  significant: boolean;
}

interface ExperimentState {
  def: Required<Pick<ExperimentDef, 'coverage' | 'enabled'>> & ExperimentDef;
  /** Cumulative weight ranges [start, end) in [0,1), parallel to def.variants. */
  ranges: Array<{ start: number; end: number }>;
  exposures: number[];
  conversions: number[];
}

/** Normal CDF via Abramowitz–Stegun 7.1.26 (|ε| < 1.5e-7). */
function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * erf);
}

export class AbTestingEngine {
  private readonly _clock: StrategyEngineClock;
  private readonly _experiments = new Map<string, ExperimentState>();

  constructor(clock: StrategyEngineClock = new SystemEngineClock()) {
    this._clock = clock;
  }

  /**
   * Register (or replace) an experiment. Re-registration preserves
   * existing counters when the variant list is unchanged; a changed
   * variant set resets stats (mixing stats across different variants
   * would be meaningless).
   */
  defineExperiment(def: ExperimentDef): void {
    if (def.variants.length === 0) throw new Error(`Experiment "${def.id}" has no variants`);
    const totalWeight = def.variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
    if (totalWeight <= 0) throw new Error(`Experiment "${def.id}" has zero total weight`);

    const ranges: Array<{ start: number; end: number }> = [];
    let acc = 0;
    for (const v of def.variants) {
      const w = Math.max(0, v.weight) / totalWeight;
      ranges.push({ start: acc, end: acc + w });
      acc += w;
    }

    const prev = this._experiments.get(def.id);
    const sameVariants =
      prev !== undefined &&
      prev.def.variants.length === def.variants.length &&
      prev.def.variants.every((v, i) => v.name === def.variants[i].name);

    this._experiments.set(def.id, {
      def: { coverage: 1, enabled: true, ...def },
      ranges,
      exposures: sameVariants ? prev!.exposures : def.variants.map(() => 0),
      conversions: sameVariants ? prev!.conversions : def.variants.map(() => 0),
    });
    void this._clock;
  }

  /**
   * Assign `subjectId` to a variant, or `null` when the subject falls
   * outside experiment coverage or the experiment is disabled.
   */
  assign(experimentId: string, subjectId: string): string | null {
    const exp = this._experiments.get(experimentId);
    if (!exp) throw new ExperimentNotFoundError(experimentId);
    if (!exp.def.enabled) return null;

    const h = fnv1a32(`${experimentId}:${subjectId}`) / 0x100000000;
    // Coverage gate: subjects outside the covered fraction get nothing.
    if (h >= exp.def.coverage) return null;
    // Rescale into [0, coverage) so weights still normalize to 1.
    const bucket = h / exp.def.coverage;
    for (let i = 0; i < exp.ranges.length; i++) {
      const r = exp.ranges[i];
      if (bucket >= r.start && bucket < r.end) return exp.def.variants[i].name;
    }
    // FP edge: bucket == 1.0 lands in the last range.
    return exp.def.variants[exp.def.variants.length - 1].name;
  }

  /** Assignment + exposure recording in one call (the common case). */
  assignAndExpose(experimentId: string, subjectId: string): string | null {
    const v = this.assign(experimentId, subjectId);
    if (v !== null) this.recordExposure(experimentId, v);
    return v;
  }

  recordExposure(experimentId: string, variant: string): void {
    const i = this._variantIndex(experimentId, variant);
    this._experiments.get(experimentId)!.exposures[i]++;
  }

  recordConversion(experimentId: string, variant: string): void {
    const i = this._variantIndex(experimentId, variant);
    this._experiments.get(experimentId)!.conversions[i]++;
  }

  stats(experimentId: string): VariantStats[] {
    const exp = this._mustGet(experimentId);
    return exp.def.variants.map((v, i) => {
      const exposures = exp.exposures[i];
      const conversions = exp.conversions[i];
      return {
        variant: v.name,
        exposures,
        conversions,
        conversionRate: exposures > 0 ? conversions / exposures : 0,
      };
    });
  }

  /**
   * Welch's t-test comparing `challenger` conversion rate against
   * `control`, for binary outcomes. `alpha` gates `significant`.
   */
  significance(experimentId: string, control: string, challenger: string, alpha = 0.05): SignificanceResult {
    const exp = this._mustGet(experimentId);
    const ci = this._variantIndex(experimentId, control);
    const ti = this._variantIndex(experimentId, challenger);

    const n1 = exp.exposures[ci];
    const n2 = exp.exposures[ti];
    const p1 = n1 > 0 ? exp.conversions[ci] / n1 : 0;
    const p2 = n2 > 0 ? exp.conversions[ti] / n2 : 0;

    if (n1 < 2 || n2 < 2) {
      return {
        control,
        challenger,
        controlRate: p1,
        challengerRate: p2,
        uplift: p1 > 0 ? (p2 - p1) / p1 : 0,
        tStatistic: 0,
        degreesOfFreedom: 0,
        pValue: 1,
        significant: false,
      };
    }

    const v1 = (p1 * (1 - p1)) / n1;
    const v2 = (p2 * (1 - p2)) / n2;
    const se = Math.sqrt(v1 + v2);

    if (se === 0) {
      // Both samples degenerate (all-convert or none-convert, equal).
      const equal = p1 === p2;
      return {
        control,
        challenger,
        controlRate: p1,
        challengerRate: p2,
        uplift: p1 > 0 ? (p2 - p1) / p1 : 0,
        tStatistic: equal ? 0 : Infinity,
        degreesOfFreedom: n1 + n2 - 2,
        pValue: equal ? 1 : 0,
        significant: !equal,
      };
    }

    const t = (p2 - p1) / se;
    // Welch–Satterthwaite df.
    const df = ((v1 + v2) * (v1 + v2)) / ((v1 * v1) / (n1 - 1) + (v2 * v2) / (n2 - 1));
    // Two-sided p via normal approx (accurate for large n typical of A/B).
    const pValue = 2 * (1 - normalCdf(Math.abs(t)));

    return {
      control,
      challenger,
      controlRate: p1,
      challengerRate: p2,
      uplift: p1 > 0 ? (p2 - p1) / p1 : 0,
      tStatistic: t,
      degreesOfFreedom: df,
      pValue,
      significant: pValue < alpha,
    };
  }

  /** Enable/disable an experiment (disabled experiments assign null). */
  setEnabled(experimentId: string, enabled: boolean): void {
    this._mustGet(experimentId).def.enabled = enabled;
  }

  /** All registered experiment IDs. */
  experiments(): string[] {
    return Array.from(this._experiments.keys());
  }

  /* ---------------------------------------------------------------- */

  private _mustGet(id: string): ExperimentState {
    const e = this._experiments.get(id);
    if (!e) throw new ExperimentNotFoundError(id);
    return e;
  }

  private _variantIndex(id: string, variant: string): number {
    const e = this._mustGet(id);
    const i = e.def.variants.findIndex((v) => v.name === variant);
    if (i < 0) throw new UnknownVariantError(id, variant);
    return i;
  }
}
