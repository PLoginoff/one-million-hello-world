/**
 * LinUCBBandit — disjoint contextual bandits.
 *
 * Explore/exploit for recommendations: score candidates by model
 * estimate but bonus under-observed arms proportional to their
 * uncertainty. Each arm a maintains an independent ridge regression
 *
 *   θ̂_a = A_a⁻¹ b_a ,   A_a = λI + Σ x xᵀ ,  b_a = Σ r x
 *
 * over observed (context x, reward r) pairs. The UCB selection rule
 *
 *   arm* = argmax_a [ θ̂_a·x  +  α·√(xᵀ A_a⁻¹ x) ]
 *
 * is the Li et al. (2010) LinUCB algorithm — the exploration term is
 * the Mahalanobis distance of x under the arm's design matrix, so arms
 * get boosted exactly where their model is least constrained by data.
 *
 * Disjoint (per-arm) models beat shared models when items have
 * genuinely different audiences; the d×d per-arm memory is the price.
 *
 * Numerics: A⁻¹ is maintained directly and updated by Sherman–Morrison
 *
 *   A⁻¹ ← A⁻¹ − (A⁻¹ x xᵀ A⁻¹) / (1 + xᵀ A⁻¹ x)
 *
 * per observation — O(d²) per reward, no factorization. An optional
 * decay γ discounts history each update (non-stationary rewards).
 *
 * Complexity: rank O(A·d²) over A arms; update O(d²); memory O(A·d²).
 *
 * @module RecommendationLayer/Engine
 */

import { ItemId } from '../implementations/recommend/Types';
import { ArmScore, BanditArmStats, BanditOptions } from './types';

interface ArmModel {
  /** inverse design matrix A⁻¹, row-major d×d */
  inv: Float64Array;
  /** reward accumulator b = Σ r·x */
  b: Float64Array;
  /** cached θ̂ = A⁻¹b, kept in sync after updates */
  theta: Float64Array;
  pulls: number;
  rewardSum: number;
}

export class LinUCBBandit {
  private readonly _d: number;
  private readonly _alpha: number;
  private readonly _lambda: number;
  private readonly _decay: number;
  private readonly _arms = new Map<ItemId, ArmModel>();

  constructor(options: BanditOptions) {
    if (options.dims <= 0) throw new Error('dims must be positive');
    this._d = options.dims;
    this._alpha = options.alpha ?? 1.0;
    this._lambda = options.regularization ?? 1.0;
    this._decay = options.decay ?? 1.0;
    if (this._decay <= 0 || this._decay > 1) {
      throw new Error('decay must be in (0, 1]');
    }
  }

  get armCount(): number {
    return this._arms.size;
  }

  /* ---------------------------------------------------------------- */
  /* Selection                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * UCB-score every arm against context `x`. New arms start from λI
   * (uninformed prior) so their bonus is maxed on the first pass —
   * guaranteed cold-arm exploration.
   */
  rank(arms: readonly ItemId[], context: readonly number[]): ArmScore[] {
    this._checkContext(context);
    const out: ArmScore[] = arms.map((arm) => {
      const m = this._model(arm);
      const est = dot(m.theta, context);
      const bonus = this._alpha * Math.sqrt(Math.max(0, quadForm(m.inv, context)));
      return { arm, estimate: est, bonus, ucb: est + bonus };
    });
    out.sort((a, b) => b.ucb - a.ucb || a.arm.localeCompare(b.arm));
    return out;
  }

  /** Best arm by UCB — `rank` specialized to the winner. */
  select(arms: readonly ItemId[], context: readonly number[]): ItemId {
    if (arms.length === 0) throw new Error('no arms to select');
    return this.rank(arms, context)[0].arm;
  }

  /* ---------------------------------------------------------------- */
  /* Learning                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Observe reward r for `arm` under context `x` — one Sherman–Morrison
   * step on A⁻¹ plus the b/θ bookkeeping. Non-contiguous contexts are
   * fine; callers drive this straight from the event stream.
   */
  update(arm: ItemId, context: readonly number[], reward: number): void {
    this._checkContext(context);
    const m = this._model(arm);
    const d = this._d;

    // forgetting: shrink the sufficient statistics before folding in
    // the new observation — equivalent to exponentially weighting the
    // history, keeps A positive-definite since λI baseline shrinks too.
    if (this._decay < 1) {
      for (let i = 0; i < d * d; i++) m.inv[i] /= this._decay; // A⁻¹ ← A⁻¹/γ ⇔ A ← γA
      for (let i = 0; i < d; i++) m.b[i] *= this._decay;
    }

    // u = A⁻¹x (d-vector); denom = 1 + xᵀu
    const u = new Float64Array(d);
    for (let i = 0; i < d; i++) {
      let s = 0;
      const row = i * d;
      for (let j = 0; j < d; j++) s += m.inv[row + j] * context[j];
      u[i] = s;
    }
    let denom = 1;
    for (let i = 0; i < d; i++) denom += context[i] * u[i];

    // A⁻¹ ← A⁻¹ − u uᵀ / denom   (Sherman–Morrison, rank-1 downdate)
    for (let i = 0; i < d; i++) {
      const row = i * d;
      const ui = u[i] / denom;
      for (let j = 0; j < d; j++) {
        m.inv[row + j] -= ui * u[j];
      }
    }

    // b ← b + r·x ; θ̂ ← A⁻¹b (O(d²) — no cheaper way in general)
    for (let i = 0; i < d; i++) m.b[i] += reward * context[i];
    for (let i = 0; i < d; i++) {
      let s = 0;
      const row = i * d;
      for (let j = 0; j < d; j++) s += m.inv[row + j] * m.b[j];
      m.theta[i] = s;
    }

    m.pulls++;
    m.rewardSum += reward;
  }

  /* ---------------------------------------------------------------- */
  /* Diagnostics                                                       */
  /* ---------------------------------------------------------------- */

  /** Current parameter estimate for an arm (copy). */
  theta(arm: ItemId): Float64Array | undefined {
    const m = this._arms.get(arm);
    return m === undefined ? undefined : m.theta.slice();
  }

  /** Uncertainty bonus a context would receive on this arm. */
  bonus(arm: ItemId, context: readonly number[]): number {
    this._checkContext(context);
    const m = this._model(arm);
    return this._alpha * Math.sqrt(Math.max(0, quadForm(m.inv, context)));
  }

  armStats(): BanditArmStats[] {
    const out: BanditArmStats[] = [];
    for (const [arm, m] of this._arms) {
      out.push({
        arm,
        pulls: m.pulls,
        meanReward: m.pulls === 0 ? 0 : m.rewardSum / m.pulls,
      });
    }
    out.sort((a, b) => a.arm.localeCompare(b.arm));
    return out;
  }

  /** Remove an arm entirely (retired item). */
  removeArm(arm: ItemId): boolean {
    return this._arms.delete(arm);
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _model(arm: ItemId): ArmModel {
    let m = this._arms.get(arm);
    if (m === undefined) {
      const d = this._d;
      const inv = new Float64Array(d * d);
      for (let i = 0; i < d; i++) inv[i * d + i] = 1 / this._lambda;
      m = {
        inv,
        b: new Float64Array(d),
        theta: new Float64Array(d),
        pulls: 0,
        rewardSum: 0,
      };
      this._arms.set(arm, m);
    }
    return m;
  }

  private _checkContext(context: readonly number[]): void {
    if (context.length !== this._d) {
      throw new Error(`context dim ${context.length} != model dim ${this._d}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function dot(a: Float64Array, x: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * x[i];
  return s;
}

/** xᵀ M x for row-major M — the Mahalanobis term inside the bonus. */
function quadForm(M: Float64Array, x: readonly number[]): number {
  const d = x.length;
  let s = 0;
  for (let i = 0; i < d; i++) {
    const row = i * d;
    let t = 0;
    for (let j = 0; j < d; j++) t += M[row + j] * x[j];
    s += x[i] * t;
  }
  return s;
}
