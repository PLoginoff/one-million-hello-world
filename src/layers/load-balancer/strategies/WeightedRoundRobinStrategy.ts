/**
 * WeightedRoundRobinStrategy
 *
 * Implements the **Smooth Weighted Round Robin** algorithm used by nginx and
 * described in "Load Balancing in a Cluster" (SWRR / smooth WRR). It produces
 * a perfectly interleaved schedule: for weights {a:5,b:1,c:1} a naive WRR would
 * emit `aaaaabc` (clumping a), whereas smooth WRR emits `aabaaca` — spreading
 * the heavy backend evenly.
 *
 * Algorithm (per selection):
 *   for each backend i:      currentWeight[i] += effectiveWeight[i]
 *   pick backend with max currentWeight
 *   chosen.currentWeight -= sum(effectiveWeight)
 *
 * Over each full period of `sum(weights)` selections every backend is chosen
 * exactly `weight` times. Selection is O(N) — fine for typical upstream sizes
 * (< 1000); a heap-based variant would be O(log N) but adds complexity that is
 * unjustified for this codebase.
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
 * Mutable scheduling state per backend id. Kept in a Map (not on the entry
 * itself) so the strategy can be dropped and re-attached without corrupting
 * pool state.
 */
interface SchedState {
  currentWeight: number;
}

export class WeightedRoundRobinStrategy implements IBalancingStrategy {
  readonly name = 'weighted-round-robin';

  private readonly _state: Map<string, SchedState>;
  private _selectionCount: number;

  constructor() {
    this._state = new Map();
    this._selectionCount = 0;
  }

  select(backends: readonly BackendPoolEntry[], _request: BalanceRequest): BackendSelection | undefined {
    if (backends.length === 0) {
      return undefined;
    }

    // Sync state map with current candidates (drop stale ids lazily).
    let totalWeight = 0;
    let best: BackendPoolEntry | undefined;
    let bestState: SchedState | undefined;

    for (const entry of backends) {
      let state = this._state.get(entry.backend.id);
      if (!state) {
        state = { currentWeight: 0 };
        this._state.set(entry.backend.id, state);
      }
      const effective = this._effectiveWeight(entry);
      state.currentWeight += effective;
      totalWeight += effective;
      if (!best || !bestState || state.currentWeight > bestState.currentWeight) {
        best = entry;
        bestState = state;
      }
    }

    if (!best || !bestState) {
      return undefined;
    }

    bestState.currentWeight -= totalWeight;
    this._selectionCount += 1;

    return {
      backend: best.backend,
      strategy: this.name,
      selectedAt: Date.now(),
      diagnostics: {
        chosenCurrentWeight: bestState.currentWeight,
        totalWeight,
        selectionNumber: this._selectionCount,
      },
    };
  }

  onBackendAdded(entry: BackendPoolEntry): void {
    if (!this._state.has(entry.backend.id)) {
      this._state.set(entry.backend.id, { currentWeight: 0 });
    }
  }

  onBackendRemoved(entry: BackendPoolEntry): void {
    this._state.delete(entry.backend.id);
  }

  /**
   * Weight actually used for scheduling: static weight × health factor.
   * `degraded` backends get 1/10 of their weight — still routable, but
   * traffic shifts to healthier peers.
   */
  private _effectiveWeight(entry: BackendPoolEntry): number {
    const base = Math.max(1, entry.backend.weight);
    return entry.status === 'degraded' ? Math.max(1, Math.floor(base / 10)) : base;
  }

  /** For tests/diagnostics: current smoothed weight per backend id. */
  getCurrentWeights(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [id, s] of this._state) {
      out.set(id, s.currentWeight);
    }
    return out;
  }
}
