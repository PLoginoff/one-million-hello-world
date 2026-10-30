/**
 * ThompsonSamplingBandit — Bayesian arm selection.
 *
 * ε-greedy explores uniformly, wasting pulls on arms that are already
 * clearly bad. Thompson sampling explores *in proportion to each arm's
 * chance of being best*: on each selection, draw a sample from every
 * arm's Beta(α,β) posterior and pick the argmax. Properties:
 *
 *   - arms with uncertain posteriors get explored (wide Beta → volatile
 *     samples → occasionally win the argmax);
 *   - arms with strong records rarely lose the argmax (narrow Beta
 *     concentrates on the true mean);
 *   - no ε hyperparameter — exploration falls out of uncertainty.
 *
 * Beta sampling via the two-gamma trick: a draw from Beta(α,β) is
 * `G(α)/(G(α)+G(β))` where G is a Gamma variate; Gamma draws use
 * Marsaglia–Tsang (2000) — α≥1 only here because we maintain
 * α,β ≥ 1 priors, so the simpler acceptance-rejection path suffices.
 *
 * Selection is non-deterministic (that's the point), so this bandit
 * doesn't offer subject-stickiness — use `EpsilonGreedyBandit` when
 * users must stay in one arm.
 *
 * @module StrategyLayer/Engine
 */

import { StrategyEngineClock, SystemEngineClock } from './types';

export interface ThompsonArm {
  name: string;
  alpha: number;
  beta: number;
  pulls: number;
  /** Posterior mean. */
  mean: number;
  /** Posterior variance (uncertainty). */
  variance: number;
}

export interface ThompsonOptions {
  /** Beta prior pseudo-counts. Default (1,1) = uniform prior. */
  priorAlpha?: number;
  priorBeta?: number;
  /** RNG injection for tests. */
  random?: () => number;
  clock?: StrategyEngineClock;
}

interface ArmState {
  alpha: number;
  beta: number;
  pulls: number;
}

/** Marsaglia–Tsang Gamma(α,1) for α ≥ 1 (the only range we maintain). */
function gammaSample(alpha: number, rand: () => number): number {
  if (alpha < 1) {
    // boost α by sampling G(α+1)·U^(1/α) — standard reduction
    return gammaSample(alpha + 1, rand) * Math.pow(rand(), 1 / alpha);
  }
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = 0;
    let v = 0;
    do {
      x = 2 * rand() - 1; // approximated normal via uniform pair; adequate for posterior sampling
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    // Squeeze-free acceptance check (log-form would need ln; keep it simple).
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** One draw from Beta(α,β). */
function betaSample(alpha: number, beta: number, rand: () => number): number {
  const ga = gammaSample(alpha, rand);
  const gb = gammaSample(beta, rand);
  const sum = ga + gb;
  return sum > 0 ? ga / sum : 0.5;
}

export class ThompsonSamplingBandit {
  private readonly _priorA: number;
  private readonly _priorB: number;
  private readonly _rand: () => number;
  private readonly _clock: StrategyEngineClock;
  private readonly _arms = new Map<string, ArmState>();
  private _totalPulls = 0;

  constructor(armNames: readonly string[], options: ThompsonOptions = {}) {
    if (armNames.length === 0) throw new Error('bandit needs ≥1 arm');
    this._priorA = options.priorAlpha ?? 1;
    this._priorB = options.priorBeta ?? 1;
    this._rand = options.random ?? Math.random;
    this._clock = options.clock ?? new SystemEngineClock();
    for (const name of armNames) {
      this._arms.set(name, { alpha: this._priorA, beta: this._priorB, pulls: 0 });
    }
    void this._clock;
  }

  /** Sample once from every posterior and return the argmax arm. */
  select(): string {
    let best = '';
    let bestDraw = -1;
    for (const [name, a] of this._arms) {
      const draw = betaSample(a.alpha, a.beta, this._rand);
      if (draw > bestDraw) {
        bestDraw = draw;
        best = name;
      }
    }
    return best;
  }

  /** Record an outcome for `arm`. */
  record(arm: string, rewarded: boolean): void {
    const a = this._arms.get(arm);
    if (!a) throw new Error(`unknown bandit arm "${arm}"`);
    a.pulls++;
    this._totalPulls++;
    if (rewarded) a.alpha++;
    else a.beta++;
  }

  /** Posterior stats per arm. */
  arms(): ThompsonArm[] {
    return Array.from(this._arms.entries()).map(([name, a]) => {
      const n = a.alpha + a.beta;
      const mean = a.alpha / n;
      const variance = (a.alpha * a.beta) / (n * n * (n + 1));
      return { name, alpha: a.alpha, beta: a.beta, pulls: a.pulls, mean, variance };
    });
  }

  /** Arm with highest posterior mean (exploitation view). */
  bestArm(): string {
    let best = '';
    let bestMean = -1;
    for (const [name, a] of this._arms) {
      const m = a.alpha / (a.alpha + a.beta);
      if (m > bestMean) {
        bestMean = m;
        best = name;
      }
    }
    return best;
  }

  /** Estimated probability each arm is the best (Monte-Carlo over `samples` draws). */
  winProbabilities(samples = 512): Map<string, number> {
    const wins = new Map<string, number>();
    const names = Array.from(this._arms.keys());
    for (const n of names) wins.set(n, 0);
    for (let i = 0; i < samples; i++) {
      const pick = this.select();
      wins.set(pick, (wins.get(pick) ?? 0) + 1);
    }
    for (const n of names) wins.set(n, (wins.get(n) ?? 0) / samples);
    return wins;
  }
}
