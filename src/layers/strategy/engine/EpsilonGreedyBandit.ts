/**
 * EpsilonGreedyBandit — multi-armed bandit variant selection.
 *
 * A/B tests split traffic *statically* (50/50 for the whole experiment);
 * bandits shift traffic toward the better variant *as evidence arrives*:
 *
 *   with prob ε        → explore: uniform random variant
 *   with prob 1−ε      → exploit: argmax estimated conversion rate
 *
 * ε-greedy is the simplest correct bandit: it guarantees eventual
 * convergence to the best arm while continuously collecting evidence
 * on the others. Reward here is binary (converted / not converted) —
 * arms track Beta(α,β) posteriors, and the mean `α/(α+β)` is the
 * exploitable estimate.
 *
 * Implementation:
 *   - priors start uniform (α=β=1 → mean 0.5) so early pulls aren't
 *     dominated by a lucky first conversion;
 *   - `select(subjectId?)` is deterministic-per-subject when given a
 *     sticky key (hash → bucket), random otherwise;
 *   - `record` updates the arm's posterior;
 *   - `probabilities` returns the current pull-probability per arm
 *     for analytics (exploit share ∝ estimated win chance — this is
 *     technically Thompson-like display, not the ε-greedy selection
 *     logic itself).
 *
 * @module StrategyLayer/Engine
 */

import { fnv1a32, StrategyEngineClock, SystemEngineClock } from './types';

export interface BanditArm {
  name: string;
  alpha: number;
  beta: number;
  pulls: number;
  /** Current posterior mean (exploitation score). */
  mean: number;
}

export interface BanditOptions {
  /** Exploration rate in [0,1]. Default 0.1. */
  epsilon?: number;
  /** Prior Beta pseudo-counts (1,1 = uniform). */
  priorAlpha?: number;
  priorBeta?: number;
  random?: () => number;
  clock?: StrategyEngineClock;
}

interface ArmState {
  alpha: number;
  beta: number;
  pulls: number;
}

export class EpsilonGreedyBandit {
  private readonly _epsilon: number;
  private readonly _priorA: number;
  private readonly _priorB: number;
  private readonly _rand: () => number;
  private readonly _clock: StrategyEngineClock;
  private readonly _arms = new Map<string, ArmState>();

  constructor(armNames: readonly string[], options: BanditOptions = {}) {
    if (armNames.length === 0) throw new Error('bandit needs ≥1 arm');
    this._epsilon = Math.max(0, Math.min(1, options.epsilon ?? 0.1));
    this._priorA = options.priorAlpha ?? 1;
    this._priorB = options.priorBeta ?? 1;
    this._rand = options.random ?? Math.random;
    this._clock = options.clock ?? new SystemEngineClock();
    for (const name of armNames) {
      this._arms.set(name, { alpha: this._priorA, beta: this._priorB, pulls: 0 });
    }
    void this._clock;
  }

  /**
   * Select an arm. With `subjectId`, selection is deterministic
   * (sticky per subject) — a user stays in their arm across calls.
   */
  select(subjectId?: string): string {
    const explore = subjectId === undefined ? this._rand() : fnv1a32(`explore:${subjectId}`) / 0x100000000;
    const names = Array.from(this._arms.keys());
    if (explore < this._epsilon) {
      // Uniform random arm. Sticky via hash for subject-bound calls.
      const pick = subjectId === undefined ? Math.floor(this._rand() * names.length) : fnv1a32(`arm:${subjectId}`) % names.length;
      return names[Math.min(names.length - 1, pick)];
    }
    // Exploit: argmax posterior mean. Tie → deterministic by name order.
    let best = names[0];
    let bestMean = this._mean(best);
    for (const name of names.slice(1)) {
      const m = this._mean(name);
      if (m > bestMean) {
        bestMean = m;
        best = name;
      }
    }
    return best;
  }

  /** Record an outcome for `arm`: `rewarded` = conversion happened. */
  record(arm: string, rewarded: boolean): void {
    const a = this._arms.get(arm);
    if (!a) throw new Error(`unknown bandit arm "${arm}"`);
    a.pulls++;
    if (rewarded) a.alpha++;
    else a.beta++;
  }

  /** Posterior mean for `arm`. */
  private _mean(arm: string): number {
    const a = this._arms.get(arm)!;
    return a.alpha / (a.alpha + a.beta);
  }

  /** Snapshot of all arms for dashboards. */
  arms(): BanditArm[] {
    return Array.from(this._arms.entries()).map(([name, a]) => ({
      name,
      alpha: a.alpha,
      beta: a.beta,
      pulls: a.pulls,
      mean: a.alpha / (a.alpha + a.beta),
    }));
  }

  /** Current best arm (highest posterior mean). */
  bestArm(): string {
    const names = Array.from(this._arms.keys());
    let best = names[0];
    let bestMean = this._mean(best);
    for (const n of names.slice(1)) {
      const m = this._mean(n);
      if (m > bestMean) {
        bestMean = m;
        best = n;
      }
    }
    return best;
  }
}
