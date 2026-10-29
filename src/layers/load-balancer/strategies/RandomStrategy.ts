/**
 * RandomStrategy
 *
 * Uniformly random backend selection. Stateless and contention-free — the
 * reference implementation for "why you often don't need anything fancier".
 * For N backends under uniform random selection each backend's share
 * converges to 1/N (law of large numbers) with variance O(1/N).
 *
 * The RNG is injectable so tests can use seeded deterministic generators.
 *
 * @module LoadBalancerLayer/Strategies
 */

import {
  BackendPoolEntry,
  BackendSelection,
  BalanceRequest,
  IBalancingStrategy,
} from '../types/backend';

/**
 * Weighted variant: when `respectWeights` is true, samples proportional to
 * backend weight (cumsum + binary-search-free linear scan — O(N)).
 */
export class RandomStrategy implements IBalancingStrategy {
  readonly name = 'random';

  private readonly _rng: () => number;
  private readonly _respectWeights: boolean;
  private _selectionCount: number;

  /**
   * @param rng            source of uniform [0,1) values (default Math.random)
   * @param respectWeights weight-proportional sampling when true
   */
  constructor(rng: () => number = Math.random, respectWeights: boolean = false) {
    this._rng = rng;
    this._respectWeights = respectWeights;
    this._selectionCount = 0;
  }

  select(backends: readonly BackendPoolEntry[], _request: BalanceRequest): BackendSelection | undefined {
    if (backends.length === 0) {
      return undefined;
    }

    let chosen: BackendPoolEntry;
    if (!this._respectWeights) {
      const idx = Math.floor(this._rng() * backends.length) % backends.length;
      chosen = backends[idx];
    } else {
      const total = backends.reduce((s, e) => s + Math.max(1, e.backend.weight), 0);
      let roll = this._rng() * total;
      chosen = backends[backends.length - 1];
      for (const e of backends) {
        roll -= Math.max(1, e.backend.weight);
        if (roll < 0) {
          chosen = e;
          break;
        }
      }
    }

    this._selectionCount += 1;
    return {
      backend: chosen.backend,
      strategy: this.name,
      selectedAt: Date.now(),
      diagnostics: {
        poolSize: backends.length,
        weighted: this._respectWeights,
        selectionNumber: this._selectionCount,
      },
    };
  }
}
