/**
 * MatrixFactorization
 *
 * Latent-factor model trained with stochastic gradient descent:
 *   r_ui ≈ μ + b_u + b_i + p_u · q_i
 * With L2 regularization on biases and factors. This is the classic
 * Koren et al. baseline + factors model.
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

export interface MfOptions {
  /** number of latent factors */
  readonly factors?: number;
  /** SGD iterations over the dataset */
  readonly epochs?: number;
  readonly learningRate?: number;
  readonly regularization?: number;
  readonly seed?: number;
}

/** Deterministic PRNG (mulberry32) for reproducible init. */
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

export class MatrixFactorization implements IRecommender {
  readonly name = 'matrix-factorization';
  private readonly matrix: RatingMatrix;
  private readonly factors: number;
  private readonly epochs: number;
  private readonly lr: number;
  private readonly reg: number;
  private readonly seed: number;

  private mu = 0;
  private userBias = new Map<UserId, number>();
  private itemBias = new Map<ItemId, number>();
  private userFactors = new Map<UserId, number[]>();
  private itemFactors = new Map<ItemId, number[]>();
  private userIndex = new Map<UserId, number>();
  private itemIndex = new Map<ItemId, number>();
  private trained = false;
  private trainRmse = 0;

  constructor(matrix: RatingMatrix, options: MfOptions = {}) {
    this.matrix = matrix;
    this.factors = options.factors ?? 16;
    this.epochs = options.epochs ?? 40;
    this.lr = options.learningRate ?? 0.01;
    this.reg = options.regularization ?? 0.02;
    this.seed = options.seed ?? 42;
  }

  /** Train the model. Call once before scoring. */
  train(): void {
    const rand = mulberry32(this.seed);
    const users = this.matrix.users();
    const items = this.matrix.items();
    this.mu = this.matrix.mean();

    const init = () => (rand() - 0.5) * 0.1;
    users.forEach((u, i) => {
      this.userIndex.set(u, i);
      this.userBias.set(u, 0);
      this.userFactors.set(u, Array.from({ length: this.factors }, init));
    });
    items.forEach((it, i) => {
      this.itemIndex.set(it, i);
      this.itemBias.set(it, 0);
      this.itemFactors.set(it, Array.from({ length: this.factors }, init));
    });

    // collect ratings
    const samples: Array<{ u: UserId; i: ItemId; r: number }> = [];
    for (const u of users) {
      for (const [i, r] of this.matrix.userRatings(u)) {
        samples.push({ u, i, r });
      }
    }

    for (let epoch = 0; epoch < this.epochs; epoch++) {
      // shuffle deterministically
      for (let i = samples.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [samples[i], samples[j]] = [samples[j], samples[i]];
      }
      let se = 0;
      for (const s of samples) {
        const pred = this.predictRaw(s.u, s.i);
        const err = s.r - pred;
        se += err * err;
        const bu = this.userBias.get(s.u) ?? 0;
        const bi = this.itemBias.get(s.i) ?? 0;
        this.userBias.set(s.u, bu + this.lr * (err - this.reg * bu));
        this.itemBias.set(s.i, bi + this.lr * (err - this.reg * bi));
        const pu = this.userFactors.get(s.u);
        const qi = this.itemFactors.get(s.i);
        if (pu !== undefined && qi !== undefined) {
          for (let f = 0; f < this.factors; f++) {
            const puf = pu[f];
            const qif = qi[f];
            pu[f] = puf + this.lr * (err * qif - this.reg * puf);
            qi[f] = qif + this.lr * (err * puf - this.reg * qif);
          }
        }
      }
      this.trainRmse = samples.length > 0 ? Math.sqrt(se / samples.length) : 0;
    }
    this.trained = true;
  }

  rmse(): number {
    return this.trainRmse;
  }

  isTrained(): boolean {
    return this.trained;
  }

  private predictRaw(userId: UserId, itemId: ItemId): number {
    const bu = this.userBias.get(userId) ?? 0;
    const bi = this.itemBias.get(itemId) ?? 0;
    const pu = this.userFactors.get(userId);
    const qi = this.itemFactors.get(itemId);
    let dot = 0;
    if (pu !== undefined && qi !== undefined) {
      for (let f = 0; f < this.factors; f++) dot += pu[f] * qi[f];
    }
    return this.mu + bu + bi + dot;
  }

  score(userId: UserId, itemId: ItemId): number {
    if (!this.trained) this.train();
    return this.predictRaw(userId, itemId);
  }

  /** Latent factor vector for an item (undefined if unseen). */
  itemVector(itemId: ItemId): readonly number[] | undefined {
    return this.itemFactors.get(itemId);
  }

  userVector(userId: UserId): readonly number[] | undefined {
    return this.userFactors.get(userId);
  }

  /** Similar items in latent space (cosine). */
  similarItems(itemId: ItemId, topN = 10): ScoredItem[] {
    const qi = this.itemFactors.get(itemId);
    if (qi === undefined) return [];
    const normI = Math.sqrt(qi.reduce((s, v) => s + v * v, 0));
    if (normI === 0) return [];
    const out: ScoredItem[] = [];
    for (const [other, qo] of this.itemFactors) {
      if (other === itemId) continue;
      let dot = 0;
      let normO = 0;
      for (let f = 0; f < this.factors; f++) {
        dot += qi[f] * qo[f];
        normO += qo[f] * qo[f];
      }
      if (normO === 0) continue;
      out.push({ itemId: other, score: dot / (normI * Math.sqrt(normO)) });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, topN);
  }

  recommend(userId: UserId, options: RecommendOptions = {}): ScoredItem[] {
    if (!this.trained) this.train();
    return defaultRecommend(this, this.matrix, userId, options);
  }
}
