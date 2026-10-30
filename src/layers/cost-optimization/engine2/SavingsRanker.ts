/**
 * Savings Recommendation Ranker
 *
 * FinOps platforms generate hundreds of savings recommendations — but
 * engineers have finite attention. This engine ranks recommendations by
 * a defensible priority metric rather than raw savings (which biases
 * toward huge, risky, never-implemented items):
 *
 *        savings × confidence
 *   ROI = ─────────────────────
 *              effort
 *
 * - `savings`: monthly saving in cents.
 * - `confidence`: probability in [0,1] the saving is real (e.g. an idle
 *   dev instance → 0.95; a "maybe resize" → 0.4).
 * - `effort`: implementation effort in engineer-hours.
 *
 * Additional ranking inputs:
 * - `risk` discount: a recommendation that could break prod is
 *   multiplied by (1 - riskPenalty × riskLevel), keeping the ranking
 *   honest about "cheap to say, expensive to be wrong".
 * - `staleAfterDays`: recommendations decay — a 90-day-old "delete idle
 *   volume" is less trustworthy than a fresh one.
 *
 * Output tiers (apply-now / plan / backlog) are produced by percentile
 * cutoffs over the ranked list — the same bucketing real FinOps
 * dashboards (CloudHealth, Cloudability) use for "quick wins" vs
 * "strategic" work.
 *
 * Complexity: O(n log n) for sort; O(1) per recommendation scoring.
 *
 * @module CostOptimization/Engine2
 */

import { IClock, SystemClock, DAY_MS } from '../engines/types';

/** What kind of action the recommendation describes. */
export enum RecommendationKind {
  /** Terminate/idle-stop resources that are unused. */
  TERMINATE_IDLE = 'terminate-idle',
  /** Move to a smaller SKU. */
  RIGHTSIZING = 'rightsizing',
  /** Convert on-demand to reserved/savings-plan. */
  COMMITMENT = 'commitment',
  /** Spot/preemptible migration for fault-tolerant work. */
  SPOT = 'spot',
  /** Delete unattached storage. */
  STORAGE_CLEANUP = 'storage-cleanup',
  /** Move data to a cheaper tier. */
  STORAGE_TIERING = 'storage-tiering',
  /** Schedule off-hours shutdown. */
  SCHEDULED_STOP = 'scheduled-stop',
  /** Architectural change (e.g. cache in front of expensive service). */
  ARCHITECTURE = 'architecture',
}

/** One savings recommendation. */
export interface SavingsRecommendation {
  readonly id: string;
  readonly kind: RecommendationKind;
  readonly resourceIds: readonly string[];
  /** Estimated monthly saving in cents. */
  readonly monthlySavingsCents: number;
  /** Confidence in [0,1] that the saving is real and safe to claim. */
  readonly confidence: number;
  /** Engineer-hours to implement. */
  readonly effortHours: number;
  /** Risk of implementation causing an incident, in [0,1]. */
  readonly risk: number;
  /** When the recommendation was generated (epoch ms). */
  readonly generatedAt: number;
  /** Free-form rationale for the report. */
  readonly rationale?: string;
}

/** A scored recommendation ready for prioritisation. */
export interface RankedRecommendation {
  readonly recommendation: SavingsRecommendation;
  /** Core metric: (savings × confidence) / effort. */
  readonly roi: number;
  /** ROI after risk discount and staleness decay. */
  readonly adjustedRoi: number;
  /** Annualised saving in cents. */
  readonly annualizedSavingsCents: number;
  /** Days since generation. */
  readonly ageDays: number;
  /** Bucket for UI: 'apply-now' | 'plan' | 'backlog'. */
  readonly tier: RecommendationTier;
}

export enum RecommendationTier {
  /** Top decile — do this week. */
  APPLY_NOW = 'apply-now',
  /** Middle band — schedule within the quarter. */
  PLAN = 'plan',
  /** Long tail — batch or defer. */
  BACKLOG = 'backlog',
}

/** Ranker tuning. */
export interface RankerConfig {
  /** How much risk discounts the score: roi × (1 - riskPenalty×risk). */
  readonly riskPenalty: number;
  /**
   * Recommendations older than this many days have their score decayed
   * exponentially with half-life `staleHalfLifeDays`.
   */
  readonly staleAfterDays: number;
  readonly staleHalfLifeDays: number;
  /** Fraction assigned to APPLY_NOW. Default 0.2 (top 20%). */
  readonly applyNowFraction: number;
  /** Fraction assigned to PLAN. Default 0.5 (next 50%). */
  readonly planFraction: number;
  /** Minimum ROI required for APPLY_NOW regardless of percentile. */
  readonly applyNowMinRoi: number;
}

export const DEFAULT_RANKER_CONFIG: RankerConfig = {
  riskPenalty: 0.5,
  staleAfterDays: 30,
  staleHalfLifeDays: 45,
  applyNowFraction: 0.2,
  planFraction: 0.5,
  applyNowMinRoi: 1000,
};

/**
 * SavingsRanker — ROI-based prioritisation.
 */
export class SavingsRanker {
  private readonly _config: RankerConfig;
  private readonly _clock: IClock;

  constructor(config: Partial<RankerConfig> = {}, clock: IClock = new SystemClock()) {
    this._config = { ...DEFAULT_RANKER_CONFIG, ...config };
    this._clock = clock;
  }

  /**
   * Score a single recommendation — public for ad-hoc what-if checks.
   */
  score(rec: SavingsRecommendation): number {
    const cfg = this._config;
    const effort = Math.max(rec.effortHours, 0.25); // floor: nothing is truly free
    const base = (rec.monthlySavingsCents * rec.confidence) / effort;
    const riskDiscount = 1 - cfg.riskPenalty * Math.min(1, Math.max(0, rec.risk));
    const ageMs = this._clock.now() - rec.generatedAt;
    const ageDays = Math.max(0, ageMs / DAY_MS);
    let decay = 1;
    if (ageDays > cfg.staleAfterDays) {
      const over = ageDays - cfg.staleAfterDays;
      decay = Math.pow(0.5, over / cfg.staleHalfLifeDays);
    }
    return base * riskDiscount * decay;
  }

  /**
   * Rank and tier a set of recommendations.
   * Sorted descending by adjusted ROI; ties by confidence desc.
   */
  rank(recs: readonly SavingsRecommendation[]): RankedRecommendation[] {
    const scored: RankedRecommendation[] = recs.map((r) => {
      const roi = (r.monthlySavingsCents * r.confidence) / Math.max(r.effortHours, 0.25);
      const adjusted = this.score(r);
      const ageDays = Math.max(0, (this._clock.now() - r.generatedAt) / DAY_MS);
      return {
        recommendation: r,
        roi,
        adjustedRoi: adjusted,
        annualizedSavingsCents: r.monthlySavingsCents * 12,
        ageDays,
        tier: RecommendationTier.BACKLOG, // assigned below
      };
    });
    scored.sort(
      (a, b) =>
        b.adjustedRoi - a.adjustedRoi ||
        b.recommendation.confidence - a.recommendation.confidence
    );

    // Percentile cutoffs on the sorted list.
    const cfg = this._config;
    const n = scored.length;
    const applyNowEnd = Math.ceil(n * cfg.applyNowFraction);
    const planEnd = Math.ceil(n * (cfg.applyNowFraction + cfg.planFraction));
    for (let i = 0; i < n; i++) {
      const r = scored[i];
      if (i < applyNowEnd && r.adjustedRoi >= cfg.applyNowMinRoi) {
        (r as { tier: RecommendationTier }).tier = RecommendationTier.APPLY_NOW;
      } else if (i < planEnd) {
        (r as { tier: RecommendationTier }).tier = RecommendationTier.PLAN;
      }
    }
    return scored;
  }

  /**
   * Aggregate portfolio summary: total achievable savings, count by
   * tier, and the "do this week" shortlist.
   */
  portfolio(recs: readonly SavingsRecommendation[]): {
    readonly ranked: readonly RankedRecommendation[];
    readonly totalMonthlySavingsCents: number;
    readonly applyNowCount: number;
    readonly applyNowSavingsCents: number;
    readonly planSavingsCents: number;
    readonly quickWin: RankedRecommendation | undefined;
  } {
    const ranked = this.rank(recs);
    const applyNow = ranked.filter((r) => r.tier === RecommendationTier.APPLY_NOW);
    const plan = ranked.filter((r) => r.tier === RecommendationTier.PLAN);
    return {
      ranked,
      totalMonthlySavingsCents: recs.reduce((a, r) => a + r.monthlySavingsCents, 0),
      applyNowCount: applyNow.length,
      applyNowSavingsCents: applyNow.reduce((a, r) => a + r.recommendation.monthlySavingsCents, 0),
      planSavingsCents: plan.reduce((a, r) => a + r.recommendation.monthlySavingsCents, 0),
      quickWin: applyNow[0],
    };
  }

  /**
   * Greedy selection under an effort budget — the classic knapsack
   * formulation FinOps leads use for sprint planning ("we have 20h —
   * what's the max savings we can ship?"). Greedy-by-ROI is the
   * practical approximation of the NP-hard optimum.
   */
  selectWithinBudget(
    recs: readonly SavingsRecommendation[],
    effortHoursBudget: number
  ): { readonly selected: readonly RankedRecommendation[]; readonly totalSavingsCents: number; readonly usedHours: number } {
    const ranked = this.rank(recs);
    const selected: RankedRecommendation[] = [];
    let used = 0;
    let savings = 0;
    for (const r of ranked) {
      const cost = r.recommendation.effortHours;
      if (used + cost <= effortHoursBudget) {
        selected.push(r);
        used += cost;
        savings += r.recommendation.monthlySavingsCents;
      }
    }
    return { selected, totalSavingsCents: savings, usedHours: used };
  }
}
