/**
 * Recommendation Engine — shared types.
 *
 * Vocabulary:
 * - `OnlineLearner`       — incremental matrix-factorization updates
 *                            per interaction (no batch retrain).
 * - `DiversityReranker`   — MMR-style category-spread re-ranking.
 * - `TemporalDecayer`     — exponential decay of interaction weight
 *                            by age.
 * - `SerendipityBooster`  — promotes off-profile items the model is
 *                            still confident about.
 * - `ExplanationGenerator`— "because you liked X" rationales from
 *                            nearest-neighbor evidence.
 * - `LinUCBBandit`        — contextual bandit: per-arm ridge regression
 *                            with upper-confidence-bound arm selection.
 * - `MarkovSequenceModel` — order-k Markov chain over item transitions
 *                            with additive smoothing + time decay.
 * - `InteractionStream`   — per-event model updates and session
 *                            windowing for real-time pipelines.
 * - `TrendingTracker`     — exponentially-decayed event counters for
 *                            "what's hot now".
 * - `CategoryQuota`       — per-category min/max constraints enforced
 *                            on a ranked list.
 *
 * @module RecommendationLayer/Engine
 */

import { ItemId, ScoredItem, UserId } from '../implementations/recommend/Types';
import { Interaction } from '../implementations/implicit/ImplicitCF';

export type { Interaction };

/* ------------------------------------------------------------------ */
/* Clock + RNG                                                         */
/* ------------------------------------------------------------------ */

export interface RecClock {
  now(): number;
}

export class SystemRecClock implements RecClock {
  now(): number {
    return Date.now();
  }
}

export class ManualRecClock implements RecClock {
  private _t = 0;
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/** mulberry32 — deterministic seeded PRNG (matches MF init style). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Online learning                                                     */
/* ------------------------------------------------------------------ */

/** Re-exported from implementations/implicit — the shared interaction
 *  record (`weight` = feedback strength; `timestamp` optional in
 *  practice for decay-aware callers). */
export interface OnlineLearnerOptions {
  /** latent factor count. Default 16. */
  readonly factors?: number;
  /** SGD step size. Default 0.01. */
  readonly learningRate?: number;
  /** L2 regularization on biases + factors. Default 0.02. */
  readonly regularization?: number;
  /** init PRNG seed. */
  readonly seed?: number;
  /** global mean baseline for cold items. Default 0. */
  readonly globalMean?: number;
  /**
   * Half-life for factor forgetting; 0 disables decay. Stale user
   * and item vectors shrink toward 0 between updates.
   */
  readonly decayHalfLifeMs?: number;
}

export interface Prediction {
  readonly value: number;
  /** 'cold-user' | 'cold-item' | 'cold-both' | 'model' */
  readonly path: 'model' | 'cold-user' | 'cold-item' | 'cold-both';
}

/* ------------------------------------------------------------------ */
/* Diversity re-ranking                                                */
/* ------------------------------------------------------------------ */

/** A ranked item plus its category for diversity accounting. */
export interface CategorizedItem extends ScoredItem {
  readonly category: string;
}

export interface DiversityOptions {
  /**
   * MMR blend: score' = λ·relevance − (1−λ)·maxSameCategoryCount.
   * λ=1 ignores diversity; λ=0 ignores relevance. Default 0.7.
   */
  readonly lambda?: number;
  /**
   * Hard cap on same-category items in the output. 0 = no cap.
   * Default 0.
   */
  readonly maxPerCategory?: number;
  /** output list length. Default 10. */
  readonly topN?: number;
}

/* ------------------------------------------------------------------ */
/* Temporal decay                                                      */
/* ------------------------------------------------------------------ */

export interface DecayOptions {
  /**
   * Half-life in ms: an interaction this old weighs 0.5. Default
   * 30 days.
   */
  readonly halfLifeMs?: number;
  /** Age cap in ms — older interactions are dropped. 0 = keep all. */
  readonly maxAgeMs?: number;
}

export interface DecayedRating {
  readonly userId: UserId;
  readonly itemId: ItemId;
  readonly value: number;
  /** value × decay weight — what downstream models should consume. */
  readonly effectiveValue: number;
  readonly ageMs: number;
  readonly weight: number;
}

/* ------------------------------------------------------------------ */
/* Serendipity                                                         */
/* ------------------------------------------------------------------ */

export interface SerendipityOptions {
  /**
   * Fraction of the top-N to reserve for serendipitous picks.
   * Default 0.2 (2 of 10).
   */
  readonly slotRatio?: number;
  /**
   * Minimum model score for a candidate to be serendipity-eligible —
   * "unexpected but *good*": we promote surprises we're still
   * confident about, not random junk. Default 0 (no floor).
   */
  readonly minScore?: number;
}

export interface SerendipitousItem extends ScoredItem {
  /** How far outside the user's usual categories this item is, 0..1. */
  readonly surprise: number;
}

/* ------------------------------------------------------------------ */
/* Explanations                                                        */
/* ------------------------------------------------------------------ */

export type ExplanationKind =
  /** "because you liked X, Y" — item-neighbor evidence */
  | 'similar-items'
  /** "popular with users like you" — user-neighbor evidence */
  | 'similar-users'
  /** "matches your interest in CATEGORY" — profile affinity */
  | 'category-affinity'
  /** "trending now" — popularity fallback */
  | 'trending';

export interface Explanation {
  readonly itemId: ItemId;
  readonly kind: ExplanationKind;
  /** Human-readable rationale, e.g. "Because you liked Dune, Foundation". */
  readonly text: string;
  /** Evidence item ids backing the rationale. */
  readonly evidence: readonly ItemId[];
  /** 0..1 confidence — strength of the evidence. */
  readonly confidence: number;
}

/* ------------------------------------------------------------------ */
/* Contextual bandits                                                  */
/* ------------------------------------------------------------------ */

export interface BanditOptions {
  /** context feature dimension. Required. */
  readonly dims: number;
  /**
   * Exploration scale α: UCB bonus = α·√(xᵀA⁻¹x). Higher = more
   * exploration. Default 1.0 (the paper's setting).
   */
  readonly alpha?: number;
  /** ridge regularization λ for A = λI + Σxxᵀ. Default 1.0. */
  readonly regularization?: number;
  /**
   * Forgetting factor γ∈(0,1]: A ← γA, b ← γb before each update.
   * 1 = stationary rewards; <1 adapts to drifting preferences.
   * Default 1.
   */
  readonly decay?: number;
}

export interface ArmScore {
  readonly arm: ItemId;
  /** point estimate θ̂·x — exploitation component. */
  readonly estimate: number;
  /** α·√(xᵀA⁻¹x) — exploration bonus. */
  readonly bonus: number;
  /** estimate + bonus — the UCB the arm was ranked on. */
  readonly ucb: number;
}

export interface BanditArmStats {
  readonly arm: ItemId;
  /** rewards observed for this arm. */
  readonly pulls: number;
  /** mean observed reward. */
  readonly meanReward: number;
}

/* ------------------------------------------------------------------ */
/* Sequence-aware recommendations                                      */
/* ------------------------------------------------------------------ */

export interface MarkovOptions {
  /**
   * Chain order: how many trailing items form a context state.
   * Order 1 = P(next|last); order 2 = P(next|last two). Default 1.
   */
  readonly order?: number;
  /**
   * Additive (Laplace/Lidstone) smoothing α: P(next|ctx) =
   * (count(ctx,next) + α) / (total(ctx) + α·|vocab|). Default 0.1.
   */
  readonly smoothing?: number;
  /**
   * Half-life in ms for transition-count decay; 0 disables. Old
   * sequences fade so the model follows drifting catalogs.
   */
  readonly halfLifeMs?: number;
  /** Max distinct contexts retained; LRU eviction beyond. 0 = ∞. */
  readonly maxContexts?: number;
}

export interface SequencePrediction {
  readonly itemId: ItemId;
  /** smoothed P(item | context). */
  readonly probability: number;
  /** raw transition count (post-decay) backing the prediction. */
  readonly support: number;
}

export interface SequenceContextStats {
  /** distinct context states observed. */
  readonly contexts: number;
  /** total transition observations (post-decay). */
  readonly transitions: number;
  /** average out-degree per context. */
  readonly meanBranching: number;
}

/* ------------------------------------------------------------------ */
/* Interaction stream                                                  */
/* ------------------------------------------------------------------ */

export type InteractionKind =
  | 'view'
  | 'click'
  | 'add-to-cart'
  | 'purchase'
  | 'like'
  | 'skip'
  | 'rating';

export interface InteractionEvent {
  readonly userId: UserId;
  readonly itemId: ItemId;
  readonly kind: InteractionKind;
  /** epoch millis; events may arrive slightly out of order. */
  readonly timestamp: number;
  /** for kind='rating': the star value. */
  readonly rating?: number;
  /** context features for bandit/realtime models. */
  readonly context?: readonly number[];
}

export interface StreamOptions {
  /** per-kind implicit weights; defaults below. */
  readonly kindWeights?: Readonly<Partial<Record<InteractionKind, number>>>;
  /** ms gap that splits a user's events into separate sessions. */
  readonly sessionGapMs?: number;
}

/** Summary of one processing pass for observability. */
export interface StreamUpdateResult {
  readonly userId: UserId;
  readonly itemId: ItemId;
  /** mapped implicit weight sent downstream. */
  readonly weight: number;
  /** session id the event joined (per-user counter). */
  readonly sessionId: number;
  /** true when the event started a new session. */
  readonly newSession: boolean;
}

/* ------------------------------------------------------------------ */
/* Trending                                                            */
/* ------------------------------------------------------------------ */

export interface TrendingOptions {
  /**
   * Half-life in ms of an event's contribution. score(item) =
   * Σ w·2^(-age/halfLife). Default 6 hours.
   */
  readonly halfLifeMs?: number;
  /** per-kind event weights (view < click < purchase). */
  readonly kindWeights?: Readonly<Partial<Record<InteractionKind, number>>>;
  /**
   * Per-item event cap before oldest entries are compacted into a
   * running decayed sum (bounds memory at high volume). Default 512.
   */
  readonly maxEventsPerItem?: number;
}

export interface TrendingItem {
  readonly itemId: ItemId;
  /** decayed score at query time. */
  readonly score: number;
  /** raw event count in the retained window. */
  readonly events: number;
}

/* ------------------------------------------------------------------ */
/* Category quotas                                                     */
/* ------------------------------------------------------------------ */

export interface QuotaRule {
  readonly category: string;
  /** minimum items from this category in the output (soft). */
  readonly min?: number;
  /** maximum items from this category in the output (hard). */
  readonly max?: number;
}

export interface QuotaResult {
  readonly items: readonly CategorizedItem[];
  /** items demoted/displaced to satisfy min quotas. */
  readonly promoted: readonly ItemId[];
  /** items dropped by max caps. */
  readonly dropped: readonly ItemId[];
  /** categories whose min could not be satisfied (supply-starved). */
  readonly unmet: readonly string[];
}
