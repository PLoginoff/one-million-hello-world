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
