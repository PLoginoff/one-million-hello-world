/**
 * LeastResponseTimeStrategy
 *
 * Picks the backend minimizing a composite score:
 *
 *     score = (activeConnections + 1) * ewmaResponseTime
 *
 * The `+1` models "predicted latency if we add one more request", which is the
 * key insight from Envoy's `LEAST_REQUEST` load balancer — an idle backend
 * with no latency history scores 0 and gets preferred until it accumulates
 * samples (a benevolent probing bias).
 *
 * A cold backend (no samples yet, ewma = 0) is treated as score 0 → always
 * preferred when idle, which naturally warms new members of the pool.
 *
 * O(N) per selection.
 *
 * @module LoadBalancerLayer/Strategies
 */

import {
  BackendPoolEntry,
  BackendSelection,
  BalanceRequest,
  IBalancingStrategy,
} from '../types/backend';

export class LeastResponseTimeStrategy implements IBalancingStrategy {
  readonly name = 'least-response-time';

  /**
   * Optional floor (ms) for ewma used in the score when the backend has
   * observed real traffic; prevents one ultra-fast backend from monopolizing
   * all traffic on multi-core clients where connections queue cheaply.
   */
  private readonly _latencyFloorMs: number;

  constructor(latencyFloorMs: number = 1) {
    this._latencyFloorMs = Math.max(0.001, latencyFloorMs);
  }

  select(backends: readonly BackendPoolEntry[], _request: BalanceRequest): BackendSelection | undefined {
    if (backends.length === 0) {
      return undefined;
    }

    let best: BackendPoolEntry | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const entry of backends) {
      const score = this._score(entry);
      if (score < bestScore) {
        best = entry;
        bestScore = score;
        if (score === 0) {
          break;
        }
      } else if (score === bestScore && best && entry.backend.id < best.backend.id) {
        best = entry;
      }
    }

    if (!best) {
      return undefined;
    }

    return {
      backend: best.backend,
      strategy: this.name,
      selectedAt: Date.now(),
      diagnostics: {
        score: bestScore,
        ewmaResponseTimeMs: best.ewmaResponseTimeMs,
        activeConnections: best.activeConnections,
      },
    };
  }

  /**
   * Composite selection score. Exported for tests.
   */
  score(entry: BackendPoolEntry): number {
    return this._score(entry);
  }

  private _score(entry: BackendPoolEntry): number {
    const inflight = entry.activeConnections + 1;
    const latency = Math.max(this._latencyFloorMs, entry.ewmaResponseTimeMs);
    return inflight * latency;
  }
}
