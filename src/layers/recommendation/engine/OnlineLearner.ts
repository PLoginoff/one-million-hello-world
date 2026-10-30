/**
 * OnlineLearner — incremental matrix factorization.
 *
 * The layer's `MatrixFactorization` trains by batch SGD over a full
 * RatingMatrix for `epochs` passes — fine offline, wrong online: a
 * production recommender can't retrain the whole model per click.
 *
 * This model keeps the same bias+factors parametrization
 *
 *   r̂_ui = μ + b_u + b_i + p_u · q_i
 *
 * but performs ONE SGD step per observed interaction:
 *
 *   e   = r − r̂
 *   b_u += η (e − λ b_u)     b_i += η (e − λ b_i)
 *   p_u += η (e q_i − λ p_u) q_i += η (e p_u − λ q_i)
 *
 * Users/items never seen are lazily initialized with seeded-random
 * small factors — the cold-start path then degrades gracefully to
 * mean+bias predictions (which converge quickly as biases learn).
 *
 * Forgetting: a `decayHalfLifeMs` option shrinks factors toward 0 on
 * each update proportional to staleness — simple exponential
 * forgetting so the model adapts to drifting taste without refits.
 *
 * Complexity: O(factors) per interaction. Memory O((U+I)·factors).
 *
 * @module RecommendationLayer/Engine
 */

import { ItemId, UserId } from '../implementations/recommend/Types';
import {
  Interaction,
  mulberry32,
  OnlineLearnerOptions,
  Prediction,
  RecClock,
  SystemRecClock,
} from './types';

interface FactorVec {
  bias: number;
  factors: Float64Array;
  /** last update timestamp for staleness decay */
  updatedAt: number;
}

export class OnlineLearner {
  readonly name = 'online-mf';

  private readonly _k: number;
  private readonly _lr: number;
  private readonly _reg: number;
  private readonly _rng: () => number;
  private readonly _clock: RecClock;
  private readonly _halfLifeMs: number;

  private _mean: number;
  private _observations: number;
  private readonly _users: Map<UserId, FactorVec>;
  private readonly _items: Map<ItemId, FactorVec>;

  constructor(options: OnlineLearnerOptions = {}, clock?: RecClock) {
    this._k = options.factors ?? 16;
    this._lr = options.learningRate ?? 0.01;
    this._reg = options.regularization ?? 0.02;
    this._rng = mulberry32(options.seed ?? 42);
    this._clock = clock ?? new SystemRecClock();
    this._halfLifeMs = options.decayHalfLifeMs ?? 0;
    this._mean = options.globalMean ?? 0;
    this._observations = 0;
    this._users = new Map();
    this._items = new Map();
  }

  get observations(): number {
    return this._observations;
  }

  /**
   * One interaction → one SGD step. Lazily materializes factors for
   * unseen entities; updates the running global mean as a cheap
   * baseline that keeps cold-start predictions sane.
   */
  record(interaction: Interaction): void {
    const now = this._clock.now();
    const u = this._userVec(interaction.userId, now);
    const i = this._itemVec(interaction.itemId, now);

    const pred = this._dot(u, i);
    const err = interaction.weight - pred;

    // biases
    u.bias += this._lr * (err - this._reg * u.bias);
    i.bias += this._lr * (err - this._reg * i.bias);

    // factors (read q into temp before mutating p)
    const uf = u.factors;
    const vf = i.factors;
    for (let f = 0; f < this._k; f++) {
      const puf = uf[f];
      const qif = vf[f];
      uf[f] = puf + this._lr * (err * qif - this._reg * puf);
      vf[f] = qif + this._lr * (err * puf - this._reg * qif);
    }

    // running global mean
    this._observations++;
    this._mean += (interaction.weight - this._mean) / this._observations;
  }

  recordAll(interactions: readonly Interaction[]): void {
    for (const i of interactions) this.record(i);
  }

  /**
   * Predict rating for (user, item). Cold paths fall back to mean +
   * whichever bias exists — never NaN.
   */
  predict(userId: UserId, itemId: ItemId): Prediction {
    const u = this._users.get(userId);
    const i = this._items.get(itemId);
    if (u === undefined) {
      return i === undefined
        ? { value: this._mean, path: 'cold-both' }
        : { value: this._mean + i.bias, path: 'cold-user' };
    }
    if (i === undefined) return { value: this._mean + u.bias, path: 'cold-item' };
    return { value: this._dot(u, i), path: 'model' };
  }

  /** Top-N items by predicted value over a candidate set. */
  recommend(
    userId: UserId,
    candidates: readonly ItemId[],
    topN = 10
  ): Array<{ itemId: ItemId; score: number }> {
    const scored = candidates.map((itemId) => ({
      itemId,
      score: this.predict(userId, itemId).value,
    }));
    scored.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
    return scored.slice(0, topN);
  }

  /** L2 norm of a user's factor vector (diagnostics). */
  userNorm(userId: UserId): number {
    const u = this._users.get(userId);
    if (u === undefined) return 0;
    let s = 0;
    for (const v of u.factors) s += v * v;
    return Math.sqrt(s);
  }

  /* ---------------------------------------------------------------- */

  private _dot(u: FactorVec, i: FactorVec): number {
    let s = this._mean + u.bias + i.bias;
    for (let f = 0; f < this._k; f++) s += u.factors[f] * i.factors[f];
    return s;
  }

  private _userVec(id: UserId, now: number): FactorVec {
    let v = this._users.get(id);
    if (v === undefined) {
      v = this._initVec(now);
      this._users.set(id, v);
    } else {
      this._decay(v, now);
      v.updatedAt = now;
    }
    return v;
  }

  private _itemVec(id: ItemId, now: number): FactorVec {
    let v = this._items.get(id);
    if (v === undefined) {
      v = this._initVec(now);
      this._items.set(id, v);
    } else {
      this._decay(v, now);
      v.updatedAt = now;
    }
    return v;
  }

  /** Exponential forgetting: factors shrink toward 0 with staleness. */
  private _decay(v: FactorVec, now: number): void {
    if (this._halfLifeMs <= 0 || v.updatedAt >= now) return;
    const age = now - v.updatedAt;
    const factor = Math.pow(0.5, age / this._halfLifeMs);
    v.bias *= factor;
    for (let f = 0; f < this._k; f++) v.factors[f] *= factor;
  }

  private _initVec(now: number): FactorVec {
    const factors = new Float64Array(this._k);
    for (let f = 0; f < this._k; f++) {
      factors[f] = (this._rng() - 0.5) * 0.1;
    }
    return { bias: 0, factors, updatedAt: now };
  }
}
