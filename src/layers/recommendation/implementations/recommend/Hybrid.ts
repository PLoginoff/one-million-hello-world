/**
 * Hybrid
 *
 * Popularity fallback, cold-start strategy, and a weighted hybrid scorer
 * combining multiple recommenders.
 */

import {
  RatingMatrix,
  IRecommender,
  ScoredItem,
  RecommendOptions,
  UserId,
  ItemId,
} from './Types';

/** Popularity = weighted combination of rating count and mean rating. */
export class PopularityRecommender implements IRecommender {
  readonly name = 'popularity';
  private readonly matrix: RatingMatrix;
  private readonly maxCount: number;

  constructor(matrix: RatingMatrix) {
    this.matrix = matrix;
    let max = 0;
    for (const item of matrix.items()) {
      const c = matrix.itemRatings(item).size;
      if (c > max) max = c;
    }
    this.maxCount = max || 1;
  }

  score(_userId: UserId, itemId: ItemId): number {
    const ratings = this.matrix.itemRatings(itemId);
    if (ratings.size === 0) return 0;
    const countNorm = ratings.size / this.maxCount;
    const mean = this.matrix.itemMean(itemId);
    // Bayesian-ish blend: popularity scaled by quality
    return countNorm * mean;
  }

  recommend(_userId: UserId, options: RecommendOptions = {}): ScoredItem[] {
    const topN = options.topN ?? 10;
    const exclude = options.exclude;
    const out: ScoredItem[] = [];
    for (const itemId of this.matrix.items()) {
      if (exclude !== undefined && exclude.has(itemId)) continue;
      const score = this.score(_userId, itemId);
      if (score <= 0) continue;
      out.push({ itemId, score, reason: 'popular' });
    }
    out.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
    return out.slice(0, topN);
  }
}

export interface ColdStartOptions {
  /** users with fewer ratings than this are "cold" */
  readonly minRatings?: number;
}

/**
 * Cold-start strategy: if a user has too few ratings, fall back to
 * popularity; otherwise delegate to the primary recommender. Scores are
 * blended proportionally as the user warms up.
 */
export class ColdStartRecommender implements IRecommender {
  readonly name = 'cold-start';
  private readonly primary: IRecommender;
  private readonly fallback: IRecommender;
  private readonly matrix: RatingMatrix;
  private readonly minRatings: number;

  constructor(
    primary: IRecommender,
    fallback: IRecommender,
    matrix: RatingMatrix,
    options: ColdStartOptions = {}
  ) {
    this.primary = primary;
    this.fallback = fallback;
    this.matrix = matrix;
    this.minRatings = options.minRatings ?? 5;
  }

  /** Blend factor in [0,1]: 0 = fully cold (fallback), 1 = warm (primary). */
  warmth(userId: UserId): number {
    const n = this.matrix.userRatings(userId).size;
    return Math.min(1, n / this.minRatings);
  }

  score(userId: UserId, itemId: ItemId): number {
    const w = this.warmth(userId);
    const p = this.primary.score(userId, itemId);
    const f = this.fallback.score(userId, itemId);
    return w * p + (1 - w) * f;
  }

  recommend(userId: UserId, options: RecommendOptions = {}): ScoredItem[] {
    const w = this.warmth(userId);
    if (w === 0) return this.fallback.recommend(userId, options);
    if (w === 1) return this.primary.recommend(userId, options);
    // blend both recommendation lists
    const topN = options.topN ?? 10;
    const merged = new Map<ItemId, number>();
    const norm = (list: ScoredItem[], weight: number): void => {
      const max = list.length > 0 ? list[0].score : 1;
      for (const it of list) {
        const s = max > 0 ? it.score / max : 0;
        merged.set(it.itemId, (merged.get(it.itemId) ?? 0) + s * weight);
      }
    };
    norm(this.primary.recommend(userId, { ...options, topN: topN * 2 }), w);
    norm(this.fallback.recommend(userId, { ...options, topN: topN * 2 }), 1 - w);
    const out: ScoredItem[] = [...merged.entries()].map(([itemId, score]) => ({
      itemId,
      score,
    }));
    out.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
    return out.slice(0, topN);
  }
}

export interface HybridComponent {
  readonly recommender: IRecommender;
  readonly weight: number;
}

/**
 * Weighted hybrid: normalize each component's scores to [0,1] and combine
 * with the given weights.
 */
export class HybridRecommender implements IRecommender {
  readonly name = 'hybrid';
  private readonly components: readonly HybridComponent[];
  private readonly matrix: RatingMatrix;

  constructor(components: readonly HybridComponent[], matrix: RatingMatrix) {
    this.components = components;
    this.matrix = matrix;
  }

  score(userId: UserId, itemId: ItemId): number {
    let total = 0;
    let weightSum = 0;
    for (const c of this.components) {
      total += c.weight * c.recommender.score(userId, itemId);
      weightSum += c.weight;
    }
    return weightSum > 0 ? total / weightSum : 0;
  }

  recommend(userId: UserId, options: RecommendOptions = {}): ScoredItem[] {
    const topN = options.topN ?? 10;
    const exclude = options.exclude;
    const rated = this.matrix.userRatings(userId);
    // collect candidate items = unrated items from the matrix
    const candidates = this.matrix
      .unratedItems(userId)
      .filter((i) => exclude === undefined || !exclude.has(i));
    // normalize per-component scores over candidates
    const out: ScoredItem[] = [];
    const perComponent = this.components.map((c) => {
      const scores = new Map<ItemId, number>();
      let min = Infinity;
      let max = -Infinity;
      for (const itemId of candidates) {
        const s = c.recommender.score(userId, itemId);
        scores.set(itemId, s);
        if (s < min) min = s;
        if (s > max) max = s;
      }
      return { weight: c.weight, scores, min, max };
    });
    for (const itemId of candidates) {
      if (rated.has(itemId)) continue;
      let score = 0;
      let weightSum = 0;
      for (const pc of perComponent) {
        const s = pc.scores.get(itemId) ?? 0;
        const range = pc.max - pc.min;
        const norm = range > 0 ? (s - pc.min) / range : 0;
        score += pc.weight * norm;
        weightSum += pc.weight;
      }
      if (weightSum > 0) score /= weightSum;
      out.push({ itemId, score });
    }
    out.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
    return out.slice(0, topN);
  }
}
