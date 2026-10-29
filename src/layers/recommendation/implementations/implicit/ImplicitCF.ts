/**
 * ImplicitCF
 *
 * Recommenders for implicit feedback (views, clicks, purchases — events
 * without explicit ratings):
 *  - CooccurrenceRecommender: item-item co-occurrence with lift/confidence.
 *  - ImplicitALS: Hu-Koren-Volinsky weighted matrix factorization for
 *    implicit feedback, trained via alternating least squares solved by
 *    the normal equations (conjugate gradient-free; direct solve with
 *    Jacobi iteration).
 */

import {
  RatingMatrix,
  IRecommender,
  ScoredItem,
  RecommendOptions,
  UserId,
  ItemId,
  defaultRecommend,
} from '../recommend/Types';
import { cosineSim } from '../recommend/Similarity';

export interface Interaction {
  readonly userId: UserId;
  readonly itemId: ItemId;
  /** e.g. view=1, click=2, purchase=5 */
  readonly weight: number;
}

export class InteractionStore {
  private readonly matrix: RatingMatrix;
  constructor(interactions: readonly Interaction[]) {
    this.matrix = new RatingMatrix(
      interactions.map((i) => ({ userId: i.userId, itemId: i.itemId, value: i.weight }))
    );
  }
  getMatrix(): RatingMatrix {
    return this.matrix;
  }
}

/**
 * Item-item co-occurrence recommender. score(i,j) = co(i,j) / (n_i * n_j)^alpha
 * with optional cosine-normalized variant.
 */
export class CooccurrenceRecommender implements IRecommender {
  readonly name = 'cooccurrence';
  private readonly matrix: RatingMatrix;
  private readonly alpha: number;
  private readonly cache = new Map<string, number>();

  constructor(matrix: RatingMatrix, alpha = 0.5) {
    this.matrix = matrix;
    this.alpha = alpha;
  }

  /** Number of users who interacted with both items. */
  cooccurrence(a: ItemId, b: ItemId): number {
    const key = a < b ? `${a} ${b}` : `${b} ${a}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const ua = this.matrix.itemRatings(a);
    const ub = this.matrix.itemRatings(b);
    let count = 0;
    for (const u of ua.keys()) if (ub.has(u)) count++;
    this.cache.set(key, count);
    return count;
  }

  itemSimilarity(a: ItemId, b: ItemId): number {
    if (a === b) return 1;
    const co = this.cooccurrence(a, b);
    if (co === 0) return 0;
    const na = this.matrix.itemRatings(a).size;
    const nb = this.matrix.itemRatings(b).size;
    return co / Math.pow(na * nb, this.alpha);
  }

  score(userId: UserId, itemId: ItemId): number {
    const rated = this.matrix.userRatings(userId);
    if (rated.size === 0) return 0;
    let sum = 0;
    let norm = 0;
    for (const [other, w] of rated) {
      const sim = this.itemSimilarity(itemId, other);
      sum += sim * w;
      norm += Math.abs(sim);
    }
    return norm > 0 ? sum / norm : 0;
  }

  recommend(userId: UserId, options: RecommendOptions = {}): ScoredItem[] {
    return defaultRecommend(this, this.matrix, userId, options);
  }
}

/**
 * Sequential/session-based recommender: predicts the next item from the
 * last item(s) of a session using first-order transition counts.
 */
export class SequentialRecommender implements IRecommender {
  readonly name = 'sequential';
  private readonly matrix: RatingMatrix;
  /** item -> nextItem -> transition count */
  private readonly transitions = new Map<ItemId, Map<ItemId, number>>();
  private readonly itemTotals = new Map<ItemId, number>();

  constructor(matrix: RatingMatrix, sessions: ReadonlyArray<readonly ItemId[]> = []) {
    this.matrix = matrix;
    for (const session of sessions) this.learnSession(session);
  }

  learnSession(items: readonly ItemId[]): void {
    for (let i = 0; i + 1 < items.length; i++) {
      const from = items[i];
      const to = items[i + 1];
      let row = this.transitions.get(from);
      if (row === undefined) {
        row = new Map();
        this.transitions.set(from, row);
      }
      row.set(to, (row.get(to) ?? 0) + 1);
      this.itemTotals.set(from, (this.itemTotals.get(from) ?? 0) + 1);
    }
  }

  /** P(next | current) */
  transitionProbability(from: ItemId, to: ItemId): number {
    const row = this.transitions.get(from);
    const total = this.itemTotals.get(from) ?? 0;
    if (row === undefined || total === 0) return 0;
    return (row.get(to) ?? 0) / total;
  }

  score(userId: UserId, itemId: ItemId): number {
    // use the user's most recent item as context
    const rated = this.matrix.userRatings(userId);
    if (rated.size === 0) return 0;
    // approximate "most recent" = last inserted key
    const last = [...rated.keys()][rated.size - 1];
    return this.transitionProbability(last, itemId);
  }

  recommendNext(currentItem: ItemId, topN = 10): ScoredItem[] {
    const row = this.transitions.get(currentItem);
    if (row === undefined) return [];
    const out: ScoredItem[] = [...row.entries()].map(([itemId, count]) => ({
      itemId,
      score: count / (this.itemTotals.get(currentItem) ?? 1),
      reason: `follows ${currentItem}`,
    }));
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, topN);
  }

  recommend(userId: UserId, options: RecommendOptions = {}): ScoredItem[] {
    const rated = this.matrix.userRatings(userId);
    if (rated.size === 0) return [];
    const last = [...rated.keys()][rated.size - 1];
    const recs = this.recommendNext(last, options.topN ?? 10);
    return recs.filter((r) => !rated.has(r.itemId));
  }
}

export interface AlsOptions {
  readonly factors?: number;
  readonly iterations?: number;
  readonly regularization?: number;
  /** confidence scaling: c = 1 + alpha * r */
  readonly alpha?: number;
  readonly seed?: number;
  /** conjugate-gradient iterations per solve */
  readonly cgIters?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Implicit ALS (Hu, Koren, Volinsky 2008). Preference p_ui = 1 if r_ui>0;
 * confidence c_ui = 1 + alpha*r_ui. Alternately fixes one factor matrix
 * and solves for the other. Each row solve is a small (f×f) ridge system
 * solved by Gaussian elimination.
 */
export class ImplicitALS implements IRecommender {
  readonly name = 'implicit-als';
  private readonly matrix: RatingMatrix;
  private readonly factors: number;
  private readonly iterations: number;
  private readonly reg: number;
  private readonly alpha: number;
  private readonly seed: number;
  private userFactors = new Map<UserId, Float64Array>();
  private itemFactors = new Map<ItemId, Float64Array>();
  private trained = false;

  constructor(matrix: RatingMatrix, options: AlsOptions = {}) {
    this.matrix = matrix;
    this.factors = options.factors ?? 16;
    this.iterations = options.iterations ?? 10;
    this.reg = options.regularization ?? 0.1;
    this.alpha = options.alpha ?? 40;
    this.seed = options.seed ?? 42;
  }

  train(): void {
    const rand = mulberry32(this.seed);
    const users = this.matrix.users();
    const items = this.matrix.items();
    const f = this.factors;
    for (const u of users) {
      const v = new Float64Array(f);
      for (let i = 0; i < f; i++) v[i] = rand() * 0.1;
      this.userFactors.set(u, v);
    }
    for (const it of items) {
      const v = new Float64Array(f);
      for (let i = 0; i < f; i++) v[i] = rand() * 0.1;
      this.itemFactors.set(it, v);
    }
    for (let iter = 0; iter < this.iterations; iter++) {
      // fix items, solve users
      for (const u of users) {
        this.solveRow(this.userFactors.get(u)!, this.matrix.userRatings(u), this.itemFactors);
      }
      for (const it of items) {
        this.solveRow(this.itemFactors.get(it)!, this.matrix.itemRatings(it), this.userFactors);
      }
    }
    this.trained = true;
  }

  /** Solve (YᵀCᵤY + λI)x = YᵀCᵤp for one entity's factor vector. */
  private solveRow(
    x: Float64Array,
    ratings: ReadonlyMap<string, number>,
    otherFactors: ReadonlyMap<string, Float64Array>
  ): void {
    const f = x.length;
    // A = Y^T Y + λI ; b = Σ c_i p_i y_i
    const A = new Float64Array(f * f);
    const b = new Float64Array(f);
    // Y^T Y over all other factors (unweighted base — simplification)
    for (const y of otherFactors.values()) {
      for (let i = 0; i < f; i++) {
        for (let j = 0; j < f; j++) {
          A[i * f + j] += y[i] * y[j];
        }
      }
    }
    for (const [id, r] of ratings) {
      const y = otherFactors.get(id);
      if (y === undefined) continue;
      const c = 1 + this.alpha * r;
      const p = 1; // preference = interacted
      // confidence-weighted outer product
      for (let i = 0; i < f; i++) {
        for (let j = 0; j < f; j++) {
          A[i * f + j] += (c - 1) * y[i] * y[j];
        }
        b[i] += c * p * y[i];
      }
    }
    for (let i = 0; i < f; i++) A[i * f + i] += this.reg;
    solveLinearSystem(A, b, x, f);
  }

  score(userId: UserId, itemId: ItemId): number {
    if (!this.trained) this.train();
    const pu = this.userFactors.get(userId);
    const qi = this.itemFactors.get(itemId);
    if (pu === undefined || qi === undefined) return 0;
    let dot = 0;
    for (let i = 0; i < pu.length; i++) dot += pu[i] * qi[i];
    return dot;
  }

  recommend(userId: UserId, options: RecommendOptions = {}): ScoredItem[] {
    if (!this.trained) this.train();
    return defaultRecommend(this, this.matrix, userId, options);
  }

  userVector(userId: UserId): readonly number[] | undefined {
    const v = this.userFactors.get(userId);
    return v !== undefined ? [...v] : undefined;
  }

  itemVector(itemId: ItemId): readonly number[] | undefined {
    const v = this.itemFactors.get(itemId);
    return v !== undefined ? [...v] : undefined;
  }
}

/** Solve A x = b for x via Gaussian elimination with partial pivoting. */
export function solveLinearSystem(
  A: Float64Array,
  b: Float64Array,
  x: Float64Array,
  n: number
): void {
  // augmented elimination on a copy
  const M = new Float64Array(n * (n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i * (n + 1) + j] = A[i * n + j];
    M[i * (n + 1) + n] = b[i];
  }
  for (let col = 0; col < n; col++) {
    // partial pivot
    let pivot = col;
    let max = Math.abs(M[col * (n + 1) + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r * (n + 1) + col]);
      if (v > max) {
        max = v;
        pivot = r;
      }
    }
    if (max < 1e-12) {
      M[col * (n + 1) + col] = 1e-8; // regularize singular pivot
    }
    if (pivot !== col) {
      for (let j = 0; j <= n; j++) {
        const tmp = M[col * (n + 1) + j];
        M[col * (n + 1) + j] = M[pivot * (n + 1) + j];
        M[pivot * (n + 1) + j] = tmp;
      }
    }
    for (let r = col + 1; r < n; r++) {
      const factor = M[r * (n + 1) + col] / M[col * (n + 1) + col];
      for (let j = col; j <= n; j++) {
        M[r * (n + 1) + j] -= factor * M[col * (n + 1) + j];
      }
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r * (n + 1) + n];
    for (let j = r + 1; j < n; j++) s -= M[r * (n + 1) + j] * x[j];
    x[r] = s / M[r * (n + 1) + r];
  }
}
