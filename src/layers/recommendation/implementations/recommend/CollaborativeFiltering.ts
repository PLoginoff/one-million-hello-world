/**
 * CollaborativeFiltering
 *
 * Neighborhood-based collaborative filtering:
 *  - UserBasedCF: find similar users, predict via weighted neighbor ratings.
 *  - ItemBasedCF: find similar items, predict via the user's own ratings
 *    of similar items (adjusted-cosine similarity).
 * Both support cosine and pearson similarity and k-NN neighborhoods.
 */

import {
  RatingMatrix,
  IRecommender,
  ScoredItem,
  RecommendOptions,
  UserId,
  ItemId,
  defaultRecommend,
} from './Types';
import { cosineSim, pearsonSim, adjustedCosineSim } from './Similarity';

export type CfSimilarity = 'cosine' | 'pearson' | 'adjusted-cosine';

export interface CfOptions {
  /** neighborhood size */
  readonly k?: number;
  readonly similarity?: CfSimilarity;
  /** minimum neighbor similarity to count */
  readonly minSimilarity?: number;
}

export interface Neighbor {
  readonly id: string;
  readonly similarity: number;
}

export class UserBasedCF implements IRecommender {
  readonly name = 'user-based-cf';
  private readonly matrix: RatingMatrix;
  private readonly k: number;
  private readonly similarity: CfSimilarity;
  private readonly minSimilarity: number;

  constructor(matrix: RatingMatrix, options: CfOptions = {}) {
    this.matrix = matrix;
    this.k = options.k ?? 20;
    this.similarity = options.similarity ?? 'pearson';
    this.minSimilarity = options.minSimilarity ?? 0;
  }

  /** Similar users to `userId`, descending. */
  neighbors(userId: UserId): Neighbor[] {
    const target = this.matrix.userRatings(userId);
    if (target.size === 0) return [];
    const out: Neighbor[] = [];
    for (const other of this.matrix.users()) {
      if (other === userId) continue;
      const vec = this.matrix.userRatings(other);
      const sim =
        this.similarity === 'pearson'
          ? pearsonSim(target, vec)
          : cosineSim(target, vec);
      if (sim > this.minSimilarity) out.push({ id: other, similarity: sim });
    }
    out.sort((a, b) => b.similarity - a.similarity);
    return out.slice(0, this.k);
  }

  /** Predicted rating: user mean + weighted neighbor deviations. */
  score(userId: UserId, itemId: ItemId): number {
    const neighbors = this.neighbors(userId);
    const baseMean = this.matrix.userMean(userId);
    if (neighbors.length === 0) return baseMean;
    let num = 0;
    let den = 0;
    for (const n of neighbors) {
      const r = this.matrix.rating(n.id, itemId);
      if (r === undefined) continue;
      const dev = r - this.matrix.userMean(n.id);
      num += n.similarity * dev;
      den += Math.abs(n.similarity);
    }
    if (den === 0) return baseMean;
    return baseMean + num / den;
  }

  recommend(userId: UserId, options: RecommendOptions = {}): ScoredItem[] {
    return defaultRecommend(this, this.matrix, userId, options);
  }
}

export class ItemBasedCF implements IRecommender {
  readonly name = 'item-based-cf';
  private readonly matrix: RatingMatrix;
  private readonly k: number;
  private readonly similarity: CfSimilarity;
  private readonly minSimilarity: number;
  /** cache of item -> user mean map for adjusted cosine */
  private readonly userMeans: Map<UserId, number>;
  /** item similarity cache */
  private readonly simCache: Map<string, number>;

  constructor(matrix: RatingMatrix, options: CfOptions = {}) {
    this.matrix = matrix;
    this.k = options.k ?? 20;
    this.similarity = options.similarity ?? 'adjusted-cosine';
    this.minSimilarity = options.minSimilarity ?? 0;
    this.userMeans = new Map();
    this.simCache = new Map();
  }

  private userMean(userId: UserId): number {
    let m = this.userMeans.get(userId);
    if (m === undefined) {
      m = this.matrix.userMean(userId);
      this.userMeans.set(userId, m);
    }
    return m;
  }

  /** Similarity between two items across co-rating users. */
  itemSimilarity(a: ItemId, b: ItemId): number {
    const key = a < b ? `${a}${b}` : `${b}${a}`;
    const cached = this.simCache.get(key);
    if (cached !== undefined) return cached;
    const va = this.matrix.itemRatings(a);
    const vb = this.matrix.itemRatings(b);
    let sim: number;
    if (this.similarity === 'adjusted-cosine') {
      // build user-mean vector over union of users
      const means = new Map<UserId, number>();
      for (const u of va.keys()) means.set(u, this.userMean(u));
      for (const u of vb.keys()) means.set(u, this.userMean(u));
      sim = adjustedCosineSim(va, vb, means);
    } else if (this.similarity === 'pearson') {
      sim = pearsonSim(va, vb);
    } else {
      sim = cosineSim(va, vb);
    }
    this.simCache.set(key, sim);
    return sim;
  }

  /** Top-k items similar to `itemId`. */
  similarItems(itemId: ItemId): Neighbor[] {
    const out: Neighbor[] = [];
    for (const other of this.matrix.items()) {
      if (other === itemId) continue;
      const sim = this.itemSimilarity(itemId, other);
      if (sim > this.minSimilarity) out.push({ id: other, similarity: sim });
    }
    out.sort((a, b) => b.similarity - a.similarity);
    return out.slice(0, this.k);
  }

  /** Predicted rating: weighted average of user's ratings on similar items. */
  score(userId: UserId, itemId: ItemId): number {
    const userRated = this.matrix.userRatings(userId);
    if (userRated.size === 0) return this.matrix.itemMean(itemId);
    // find k most similar items among those the user rated
    const neighbors: Neighbor[] = [];
    for (const rated of userRated.keys()) {
      const sim = this.itemSimilarity(itemId, rated);
      if (sim > this.minSimilarity) {
        neighbors.push({ id: rated, similarity: sim });
      }
    }
    neighbors.sort((a, b) => b.similarity - a.similarity);
    const top = neighbors.slice(0, this.k);
    if (top.length === 0) return this.matrix.itemMean(itemId);
    let num = 0;
    let den = 0;
    for (const n of top) {
      const r = userRated.get(n.id) ?? 0;
      num += n.similarity * r;
      den += Math.abs(n.similarity);
    }
    if (den === 0) return this.matrix.itemMean(itemId);
    return num / den;
  }

  recommend(userId: UserId, options: RecommendOptions = {}): ScoredItem[] {
    return defaultRecommend(this, this.matrix, userId, options);
  }
}
