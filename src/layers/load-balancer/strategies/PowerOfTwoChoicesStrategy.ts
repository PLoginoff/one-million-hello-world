/**
 * PowerOfTwoChoicesStrategy
 *
 * Implements the **power of two random choices** load balancing (Mitzenmacher,
 * "The Power of Two Choices in Randomized Load Balancing", 2001):
 *
 *   1. Sample two distinct backends uniformly at random.
 *   2. Route to whichever has fewer active connections (weight-normalized).
 *
 * Theory: maximum load under `d=2` choices is Θ(log log n / log d) instead of
 * Θ(log n / log log n) for d=1 — an exponential improvement, while remaining
 * O(1) per selection (no full pool scan, unlike LeastConnections' O(N)).
 *
 * Generalized to `d` choices (d≥2, default 2). With pool size < d the strategy
 * samples without replacement (poolSize distinct draws).
 *
 * The RNG is injectable for deterministic tests.
 *
 * @module LoadBalancerLayer/Strategies
 */

import {
  BackendPoolEntry,
  BackendSelection,
  BalanceRequest,
  IBalancingStrategy,
} from '../types/backend';

export class PowerOfTwoChoicesStrategy implements IBalancingStrategy {
  readonly name = 'power-of-two-choices';

  private readonly _d: number;
  private readonly _rng: () => number;
  private _selectionCount: number;

  /**
   * @param choices number of samples per selection (d ≥ 2; clamped to ≥ 2)
   * @param rng     uniform [0,1) source (default Math.random)
   */
  constructor(choices: number = 2, rng: () => number = Math.random) {
    this._d = Math.max(2, Math.floor(choices));
    this._rng = rng;
    this._selectionCount = 0;
  }

  select(backends: readonly BackendPoolEntry[], _request: BalanceRequest): BackendSelection | undefined {
    if (backends.length === 0) {
      return undefined;
    }

    // Sample d distinct indices via partial Fisher–Yates on the index domain.
    const draws = Math.min(this._d, backends.length);
    const indices = this._sampleDistinct(backends.length, draws);

    let best: BackendPoolEntry | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const i of indices) {
      const entry = backends[i];
      const score = entry.activeConnections / Math.max(1, entry.backend.weight);
      if (score < bestScore) {
        best = entry;
        bestScore = score;
      } else if (score === bestScore && best && entry.backend.id < best.backend.id) {
        best = entry;
      }
    }

    if (!best) {
      return undefined;
    }

    this._selectionCount += 1;
    return {
      backend: best.backend,
      strategy: this.name,
      selectedAt: Date.now(),
      diagnostics: {
        sampledIndices: indices,
        chosenConnections: best.activeConnections,
        selectionNumber: this._selectionCount,
      },
    };
  }

  /** The `d` parameter. */
  get choices(): number {
    return this._d;
  }

  /**
   * Partial Fisher–Yates: choose `k` distinct integers in [0, n) uniformly.
   * O(k) time, O(k) space.
   */
  private _sampleDistinct(n: number, k: number): number[] {
    const arr = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      arr[i] = i;
    }
    const out: number[] = [];
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(this._rng() * (n - i));
      [arr[i], arr[j]] = [arr[j], arr[i]];
      out.push(arr[i]);
    }
    return out;
  }
}
