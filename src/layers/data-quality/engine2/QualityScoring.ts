/**
 * Quality Scoring Model — weighted composite scores
 *
 * The rules engine produces pass/fail verdicts per dimension; this
 * module folds those verdicts into a single explainable number — the
 * "data health score" a dashboard actually surfaces. The scoring is a
 * weighted composite:
 *
 *   score = Σ (dimWeight[d] × dimScore[d]) / Σ dimWeight
 *
 * where each dimension's score is a smooth function of its violation
 * ratio — not a binary pass/fail, because a table at 2% nulls should
 * read differently than one at 40% even if both "fail" a >1% threshold.
 *
 * Dimension scoring uses a graded ramp:
 *   violationRatio ≤ warnAt  → score 100 (perfect)
 *   warnAt < ratio < failAt  → linear degrade 100 → 50
 *   ratio ≥ failAt           → linear degrade 50 → 0 at 2×failAt
 *
 * This gives reviewers a continuous signal that degrades smoothly as a
 * column slides from clean to broken — better than the cliff-edge of a
 * hard threshold for trend tracking.
 *
 * The score report preserves the per-dimension breakdown so dashboards
 * can show *which* dimension dragged the composite down.
 *
 * Complexity: O(#ruleResults).
 *
 * @module DataQuality/Engine2
 */

import { QualityDimension, RuleResult, Severity } from '../engine/QualityRules';

/** Severity rank used when computing the effective violation ratio. */
const SEVERITY_WEIGHT: Readonly<Record<Severity, number>> = {
  info: 0.25,
  warn: 0.5,
  error: 1,
  critical: 2,
};

/** Grading thresholds per dimension (violation-ratio breakpoints). */
export interface DimensionGrading {
  /** Below this ratio the dimension scores a perfect 100. */
  readonly warnAt: number;
  /** At/above this ratio the score has fallen to 50; 2× this → 0. */
  readonly failAt: number;
}

/** Per-dimension sub-score. */
export interface DimensionScore {
  readonly dimension: QualityDimension;
  readonly weight: number;
  /** Weighted violation ratio (severity-weighted violations / rows). */
  readonly violationRatio: number;
  readonly score: number; // 0–100
  /** Number of rules evaluated in this dimension. */
  readonly rulesEvaluated: number;
}

/** Composite score report. */
export interface QualityScore {
  /** 0–100 composite. */
  readonly total: number;
  /** Letter grade A–F for quick scanning. */
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
  readonly dimensions: readonly DimensionScore[];
  /** The weakest dimension — the one to fix first. */
  readonly weakest: DimensionScore | undefined;
  /** Whether the composite meets the configured passing score. */
  readonly passing: boolean;
}

/** Scoring tuning. */
export interface ScoringConfig {
  /** Weight per dimension; missing dimensions fall back to `defaultWeight`. */
  readonly weights: Partial<Record<QualityDimension, number>>;
  readonly defaultWeight: number;
  /** Grading breakpoints per dimension; falls back to `defaultGrading`. */
  readonly grading: Partial<Record<QualityDimension, DimensionGrading>>;
  readonly defaultGrading: DimensionGrading;
  /** Minimum passing composite score. Default 80. */
  readonly passingScore: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    completeness: 2,
    validity: 2,
    uniqueness: 1.5,
    consistency: 1,
    accuracy: 1,
    freshness: 1,
    anomaly: 0.5,
  },
  defaultWeight: 1,
  grading: {},
  defaultGrading: { warnAt: 0.01, failAt: 0.1 },
  passingScore: 80,
};

/**
 * Score a rule-result set into a composite quality number.
 */
export class QualityScorer {
  private readonly _config: ScoringConfig;

  constructor(config: Partial<ScoringConfig> = {}) {
    this._config = { ...DEFAULT_SCORING_CONFIG, ...config };
  }

  get config(): ScoringConfig {
    return this._config;
  }

  /**
   * Convert rule results into a composite score.
   *
   * `ruleResults` are the per-rule outcomes produced by
   * `QualityEngine.evaluate` — each with a violationRatio and a
   * worst severity. We fold severity into the ratio so a 5% critical
   * violation hurts more than a 5% info one.
   */
  score(ruleResults: readonly RuleResult[]): QualityScore {
    const cfg = this._config;
    const byDim = new Map<QualityDimension, { weighted: number; rows: number; rules: number }>();
    for (const r of ruleResults) {
      const agg = byDim.get(r.dimension) ?? { weighted: 0, rows: 0, rules: 0 };
      // Weighted violation mass = violationRatio × severity weight of the
      // rule's declared severity (the worst violation under it).
      const sev = SEVERITY_WEIGHT[r.severity] ?? 1;
      agg.weighted += r.violationRatio * sev;
      agg.rows += r.rowsEvaluated;
      agg.rules++;
      byDim.set(r.dimension, agg);
    }

    const dimensions: DimensionScore[] = [];
    let weightedSum = 0;
    let weightSum = 0;
    for (const [dim, agg] of byDim) {
      const w = cfg.weights[dim] ?? cfg.defaultWeight;
      const g = cfg.grading[dim] ?? cfg.defaultGrading;
      // Normalise weighted violation mass back to a [0,1]-ish ratio:
      // cap at 1 (a dimension can't fail harder than "everything broke").
      const ratio = Math.min(1, agg.weighted / agg.rules);
      const score = this._grade(ratio, g);
      dimensions.push({
        dimension: dim,
        weight: w,
        violationRatio: ratio,
        score,
        rulesEvaluated: agg.rules,
      });
      weightedSum += w * score;
      weightSum += w;
    }

    const total = weightSum === 0 ? 100 : weightedSum / weightSum;
    const weakest = dimensions.reduce<DimensionScore | undefined>(
      (w, d) => (w === undefined || d.score < w.score ? d : w),
      undefined
    );
    return {
      total,
      grade: this._letter(total),
      dimensions: dimensions.sort((a, b) => a.score - b.score),
      weakest,
      passing: total >= cfg.passingScore,
    };
  }

  /** Graded ramp: 100 below warnAt → 50 at failAt → 0 at 2×failAt. */
  private _grade(ratio: number, g: DimensionGrading): number {
    if (ratio <= g.warnAt) return 100;
    if (ratio <= g.failAt) {
      const t = (ratio - g.warnAt) / (g.failAt - g.warnAt);
      return 100 - 50 * t;
    }
    const t = (ratio - g.failAt) / g.failAt;
    return Math.max(0, 50 - 50 * t);
  }

  private _letter(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}
