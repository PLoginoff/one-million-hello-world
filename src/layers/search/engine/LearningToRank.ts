/**
 * LearningToRank — linear LTR re-ranker.
 *
 * Base retrieval (BM25 over the inverted index) produces a candidate
 * set ordered by text score; learning-to-rank then re-scores the top
 * N with a *linear combination of heterogeneous features*:
 *
 *   score(d) = w_text·bm25 + w_rec·recency + w_pop·popularity
 *            + w_pers·personalization + w_exact·exactMatch
 *            + w_boost·fieldBoost + Σ extra features
 *
 * Linear models (coordinate-ascent LambdaMART predecessors, logistic
 * pointwise models) remain production-relevant because they are
 * explainable — `contributions` in the result is exactly this
 * decomposition, which powers "why was this ranked above that"
 * debugging.
 *
 * This engine is a *stub* in one honest sense: weights are supplied
 * (hand-tuned, exported from an offline training job, or updated by
 * the online learner below), not learned in-process. It does provide
 * real machinery around the weights: feature normalization
 * (min-max over the candidate set, since BM25 and popularity live on
 * different scales), missing-feature defaults, and a pointwise
 * logistic update for online weight adaptation from click feedback.
 *
 * @module SearchLayer/Engine
 */

import {
  LtrWeights,
  RankCandidate,
  RankedResult,
  RankFeatures,
} from './types';

export const DEFAULT_WEIGHTS: LtrWeights = {
  textScore: 1.0,
  recencyScore: 0.3,
  popularityScore: 0.5,
  personalizationScore: 0.4,
  exactMatch: 0.8,
  fieldBoost: 0.3,
};

/** Feature extractor slots iterated by the scorer. */
const FEATURE_KEYS = [
  'textScore',
  'recencyScore',
  'popularityScore',
  'personalizationScore',
  'exactMatch',
  'fieldBoost',
] as const;

type FeatureKey = (typeof FEATURE_KEYS)[number];

export class LearningToRank {
  private _weights: LtrWeights;
  private readonly _normalize: boolean;
  private readonly _lr: number;

  /**
   * @param weights initial model weights (merged over defaults).
   * @param normalize min-max normalize numeric features across the
   *        candidate set before weighting. Default true — without it
   *        a feature with a huge raw range silently dominates.
   * @param learningRate step size for online `update()`.
   */
  constructor(
    weights: Partial<LtrWeights> = {},
    normalize = true,
    learningRate = 0.05
  ) {
    this._weights = { ...DEFAULT_WEIGHTS, ...weights };
    this._normalize = normalize;
    this._lr = learningRate;
  }

  get weights(): LtrWeights {
    return this._weights;
  }

  setWeights(w: LtrWeights): void {
    this._weights = w;
  }

  /**
   * Re-rank a candidate set. Returns all candidates sorted by final
   * score desc, each with a per-feature contribution map.
   *
   * Normalization is computed per feature across the candidate set —
   * scores are therefore relative to THIS result list, which is the
   * correct LTR semantics (features are listwise-comparable).
   */
  rerank(candidates: readonly RankCandidate[]): RankedResult[] {
    if (candidates.length === 0) return [];
    const norm = this._normalize ? featureRanges(candidates) : null;

    const results = candidates.map((c) => {
      const f = this._normalizedFeatures(c.features, norm);
      const contributions: Record<string, number> = {};
      let score = 0;
      for (const key of FEATURE_KEYS) {
        const v = f[key] ?? 0;
        const w = this._weights[key];
        const contrib = w * v;
        contributions[key] = contrib;
        score += contrib;
      }
      if (c.features.extra !== undefined && this._weights.extra !== undefined) {
        for (const [name, v] of Object.entries(c.features.extra)) {
          const w = this._weights.extra[name];
          if (w === undefined) continue;
          contributions[`extra.${name}`] = w * v;
          score += w * v;
        }
      }
      return { docId: c.docId, score, contributions };
    });

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Pointwise online update from click feedback: nudge weights toward
   * clicked candidates and away from shown-but-skipped ones —
   * logistic regression on the feature vector, one SGD step per
   * judgment.
   *
   *   w ← w + lr · (y − σ(w·x)) · x
   *
   * where y=1 for clicked, 0 for skipped. Feature vector x is the
   * candidate's raw (unnormalized) features; normalization ranges
   * aren't stable online anyway.
   */
  update(candidate: RankCandidate, clicked: boolean): void {
    const x = this._rawVector(candidate.features);
    const score = this._dot(x);
    const p = sigmoid(score);
    const err = (clicked ? 1 : 0) - p;
    const next: { -readonly [K in keyof LtrWeights]: LtrWeights[K] } = {
      ...this._weights,
    };
    for (const key of FEATURE_KEYS) {
      next[key] = this._weights[key] + this._lr * err * x[key];
    }
    if (this._weights.extra !== undefined && candidate.features.extra !== undefined) {
      const extra: Record<string, number> = { ...this._weights.extra };
      for (const [name, w] of Object.entries(this._weights.extra)) {
        const xv = candidate.features.extra[name] ?? 0;
        extra[name] = w + this._lr * err * xv;
      }
      next.extra = extra;
    }
    this._weights = next as LtrWeights;
  }

  /* ---------------------------------------------------------------- */

  /**
   * Min-max normalize each numeric feature to [0,1] using the
   * candidate set's range. Constant features normalize to 0 (they
   * carry no listwise signal).
   */
  private _normalizedFeatures(
    f: RankFeatures,
    ranges: Map<FeatureKey, { min: number; range: number }> | null
  ): Record<FeatureKey, number> {
    const out = {} as Record<FeatureKey, number>;
    for (const key of FEATURE_KEYS) {
      const v = f[key] ?? 0;
      if (ranges === null) {
        out[key] = v;
        continue;
      }
      const r = ranges.get(key)!;
      out[key] = r.range > 0 ? (v - r.min) / r.range : 0;
    }
    return out;
  }

  private _rawVector(f: RankFeatures): Record<FeatureKey, number> {
    const out = {} as Record<FeatureKey, number>;
    for (const key of FEATURE_KEYS) {
      out[key] = f[key] ?? 0;
    }
    return out;
  }

  private _dot(x: Record<FeatureKey, number>): number {
    let s = 0;
    for (const key of FEATURE_KEYS) s += this._weights[key] * x[key];
    return s;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function featureRanges(
  candidates: readonly RankCandidate[]
): Map<FeatureKey, { min: number; range: number }> {
  const mins = new Map<FeatureKey, number>();
  const maxs = new Map<FeatureKey, number>();
  for (const c of candidates) {
    for (const key of FEATURE_KEYS) {
      const v = c.features[key] ?? 0;
      const lo = mins.get(key);
      const hi = maxs.get(key);
      if (lo === undefined || v < lo) mins.set(key, v);
      if (hi === undefined || v > hi) maxs.set(key, v);
    }
  }
  const out = new Map<FeatureKey, { min: number; range: number }>();
  for (const key of FEATURE_KEYS) {
    const min = mins.get(key) ?? 0;
    const max = maxs.get(key) ?? 0;
    out.set(key, { min, range: max - min });
  }
  return out;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
