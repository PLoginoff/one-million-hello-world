/**
 * IPHashStrategy
 *
 * Sticky-session routing: `backendIndex = hash(clientIp) mod poolSize`.
 * Every request from the same client IP lands on the same backend (while the
 * pool membership is stable).
 *
 * Limitations (documented, intentional):
 *  - Like plain modulo hashing, changing the pool size reshuffles almost all
 *    assignments. Use ConsistentHashingStrategy when that matters.
 *  - Clients behind a NAT share an IP → hot spots. Documented trade-off,
 *    matches nginx `ip_hash`.
 *
 * If the chosen backend is unhealthy, we walk forward until an eligible one
 * is found — deterministic failover that preserves stickiness for healthy
 * members (a client's traffic only moves when its home backend is down).
 *
 * O(N) worst case (all but one unhealthy); O(1) typical.
 *
 * @module LoadBalancerLayer/Strategies
 */

import {
  BackendPoolEntry,
  BackendSelection,
  BalanceRequest,
  IBalancingStrategy,
  isEligible,
} from '../types/backend';

/**
 * djb2 string hash — simple, fast, deterministic.
 * (FNV-1a is used by consistent hashing; we keep a different algorithm here
 * so the two sticky layers don't correlate their buckets.)
 */
export function djb2(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0; // h * 33 + c
  }
  return h >>> 0;
}

export class IPHashStrategy implements IBalancingStrategy {
  readonly name = 'ip-hash';

  private _selectionCount: number;
  private _failoverCount: number;

  constructor() {
    this._selectionCount = 0;
    this._failoverCount = 0;
  }

  select(backends: readonly BackendPoolEntry[], request: BalanceRequest): BackendSelection | undefined {
    if (backends.length === 0) {
      return undefined;
    }

    const ip = request.clientIp ?? request.affinityKey;
    if (!ip) {
      // No identity → cannot stick. Fall back to the first eligible.
      const first = backends.find(isEligible);
      if (!first) {
        return undefined;
      }
      return {
        backend: first.backend,
        strategy: this.name,
        selectedAt: Date.now(),
        diagnostics: { reason: 'missing-client-ip' },
      };
    }

    const home = djb2(ip) % backends.length;
    for (let hop = 0; hop < backends.length; hop++) {
      const entry = backends[(home + hop) % backends.length];
      if (isEligible(entry)) {
        if (hop > 0) {
          this._failoverCount += 1;
        }
        this._selectionCount += 1;
        return {
          backend: entry.backend,
          strategy: this.name,
          selectedAt: Date.now(),
          diagnostics: {
            clientIp: ip,
            homeIndex: home,
            hops: hop,
            failover: hop > 0,
            selectionNumber: this._selectionCount,
          },
        };
      }
    }

    return undefined;
  }

  /** Number of times a request was rerouted away from its home backend. */
  get failoverCount(): number {
    return this._failoverCount;
  }
}
