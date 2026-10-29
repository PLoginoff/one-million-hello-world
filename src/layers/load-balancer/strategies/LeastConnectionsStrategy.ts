/**
 * LeastConnectionsStrategy
 *
 * Routes each request to the backend with the fewest in-flight connections,
 * scaled by backend weight (i.e., we minimize `activeConnections / weight`,
 * not just raw connections). This is the weighted-least-connections policy of
 * LVS (`ipvsadm -s wlc`) and is robust when backends are heterogeneous.
 *
 * Properties:
 *  - O(N) selection, with an early exit when a backend with zero load is found
 *    (cannot be beaten).
 *  - Ties are broken by EWMA response time, then by backend id for
 *    determinism.
 *
 * @module LoadBalancerLayer/Strategies
 */

import {
  BackendPoolEntry,
  BackendSelection,
  BalanceRequest,
  IBalancingStrategy,
} from '../types/backend';

export class LeastConnectionsStrategy implements IBalancingStrategy {
  readonly name = 'least-connections';

  private _selectionCount: number;

  constructor() {
    this._selectionCount = 0;
  }

  select(backends: readonly BackendPoolEntry[], _request: BalanceRequest): BackendSelection | undefined {
    if (backends.length === 0) {
      return undefined;
    }

    let best: BackendPoolEntry | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const entry of backends) {
      const weight = Math.max(1, entry.backend.weight);
      const score = entry.activeConnections / weight;

      if (score < bestScore) {
        best = entry;
        bestScore = score;
        if (score === 0) {
          break; // Cannot beat zero.
        }
      } else if (score === bestScore && best) {
        // Tie-break on EWMA, then id.
        if (
          entry.ewmaResponseTimeMs < best.ewmaResponseTimeMs ||
          (entry.ewmaResponseTimeMs === best.ewmaResponseTimeMs &&
            entry.backend.id < best.backend.id)
        ) {
          best = entry;
        }
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
        selectedConnections: best.activeConnections,
        normalizedScore: bestScore,
        selectionNumber: this._selectionCount,
      },
    };
  }
}
