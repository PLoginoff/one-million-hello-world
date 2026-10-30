/**
 * Locality Priority Scheduler
 *
 * `LocalityRouter` picks the single best locality tier (zone → region →
 * anywhere). This adds Envoy-style PRIORITY DISTRIBUTION: instead of
 * all-or-nothing to the closest tier, a configurable percentage of
 * traffic stays local and the rest spills — used for gradual failover,
 * capacity overflow, and "85% local / 15% elsewhere" policies.
 *
 * Tiers (like Envoy priorities):
 *   P0 = same zone        → localPercent% of traffic
 *   P1 = same region      → next share
 *   P2 = anywhere         → remainder
 *
 * When a tier is EMPTY (no healthy endpoints), its share is
 * redistributed to the next available tier proportionally — matching
 * Envoy's "priority load" redistribution rather than starving traffic.
 *
 * Selection within a tier: smooth weighted round-robin (the nginx
 * algorithm — each endpoint's effective weight rises by its weight per
 * round, the max is picked and decremented by the total; this avoids the
 * lumpy AAAA BBB C sequences of naive RR when weights differ).
 *
 * @module ServiceMeshLayer/Engine
 */

import { Endpoint } from './config-model';
import { Locality } from './LocalityRouter';
import { fnv1a32 } from '../../observability/engine/SamplingStrategies';
import { RecoveryProber } from './Ejection';

export interface LocalityDistribution {
  /** 0..1 share that should stay in-zone. Default 1.0 (strict local). */
  readonly zonePercent?: number;
  /** 0..1 share going to same-region-after-zone. Remainder → anywhere. */
  readonly regionPercent?: number;
}

interface ScoredEndpoint {
  readonly endpoint: Endpoint;
  readonly tier: 0 | 1 | 2;
}

/** Smooth WRR cursor state per tier. */
class SmoothRR {
  private readonly _weights = new Map<string, number>();
  private readonly _current = new Map<string, number>();

  /** Pick one endpoint by smooth weighted round-robin. */
  pick(endpoints: readonly Endpoint[]): Endpoint | null {
    if (endpoints.length === 0) return null;
    if (endpoints.length === 1) return endpoints[0];
    let total = 0;
    for (const e of endpoints) {
      const id = `${e.address}:${e.port}`;
      const w = Math.max(1, e.weight ?? 1);
      this._weights.set(id, w);
      total += w;
      this._current.set(id, (this._current.get(id) ?? 0) + w);
    }
    let best: Endpoint | null = null;
    let bestCur = Number.NEGATIVE_INFINITY;
    for (const e of endpoints) {
      const id = `${e.address}:${e.port}`;
      const cur = this._current.get(id) ?? 0;
      if (cur > bestCur) {
        bestCur = cur;
        best = e;
      }
    }
    const bestId = `${best!.address}:${best!.port}`;
    this._current.set(bestId, bestCur - total);
    return best;
  }
}

function tierOf(e: Endpoint, local: Locality): 0 | 1 | 2 {
  const l = e.locality;
  if (!l) return 2;
  if (l.region === local.region && l.zone === local.zone) return 0;
  if (l.region === local.region) return 1;
  return 2;
}

export class LocalityPriorityScheduler {
  private readonly _local: Locality;
  private readonly _zonePct: number;
  private readonly _regionPct: number;
  private readonly _prober?: RecoveryProber;
  private readonly _rr = [new SmoothRR(), new SmoothRR(), new SmoothRR()];

  constructor(local: Locality, dist: LocalityDistribution = {}, prober?: RecoveryProber) {
    this._local = local;
    this._zonePct = dist.zonePercent ?? 1.0;
    this._regionPct = dist.regionPercent ?? 0;
    this._prober = prober;
  }

  /**
   * Choose an endpoint honoring the distribution.
   * `routingKey` (optional) makes the tier choice deterministic per
   * caller — sticky spillover: a user who spilled to region stays there.
   */
  pick(endpoints: readonly Endpoint[], routingKey?: string): Endpoint | null {
    let pool = endpoints.filter((e) => e.healthy !== false);
    if (this._prober) {
      const p = this._prober;
      pool = pool.filter((e) => p.allows(`${e.address}:${e.port}`));
    }
    if (pool.length === 0) return null;

    // Bucket by tier.
    const tiers: ScoredEndpoint[][] = [[], [], []];
    for (const e of pool) tiers[tierOf(e, this._local)].push({ endpoint: e, tier: tierOf(e, this._local) });

    // Effective shares: redistribute empty tiers' shares downward.
    const shares = this._effectiveShares([0, 1, 2].map((t) => tiers[t].length > 0));
    if (shares.every((s) => s === 0)) return null;

    // Roll: deterministic per routingKey, uniform otherwise.
    const roll = routingKey !== undefined
      ? (fnv1a32(routingKey) % 10_000) / 10_000
      : Math.random();

    let acc = 0;
    for (let t = 0; t < 3; t++) {
      acc += shares[t];
      if (roll < acc) {
        // Rolled tier empty (e.g. all ejected) → fall to the NEXT
        // populated tier, not a random lower one.
        for (let t2 = t; t2 < 3; t2++) {
          if (tiers[t2].length > 0) {
            return this._pickInTier(tiers[t2].map((s) => s.endpoint), t2, routingKey);
          }
        }
        return null;
      }
    }
    // Fallback (float dust): last non-empty tier.
    for (let t = 2; t >= 0; t--) {
      if (tiers[t].length > 0) {
        return this._pickInTier(tiers[t].map((s) => s.endpoint), t, routingKey);
      }
    }
    return null;
  }

  /**
   * Endpoint selection inside a tier. With a routingKey, choose by hash
   * of `key + tier` — a caller pinned to a tier is pinned to the SAME
   * endpoint (sticky spillover). Without a key, smooth weighted RR
   * spreads load evenly across the tier.
   */
  private _pickInTier(endpoints: Endpoint[], tier: number, routingKey?: string): Endpoint | null {
    if (endpoints.length === 0) return null;
    if (routingKey === undefined) return this._rr[tier].pick(endpoints);
    // Weighted hash: expand each endpoint weight times, index by hash.
    const expanded: Endpoint[] = [];
    for (const e of endpoints) {
      const w = Math.max(1, e.weight ?? 1);
      for (let i = 0; i < w; i++) expanded.push(e);
    }
    return expanded[fnv1a32(`${routingKey}|t${tier}`) % expanded.length];
  }

  /**
   * Distribute the configured [zone, region, anywhere] shares over the
   * tiers that actually have endpoints: each empty tier's share goes to
   * the next populated lower-priority tier (proportional when several).
   */
  private _effectiveShares(populated: boolean[]): number[] {
    const base = [this._zonePct, this._regionPct, Math.max(0, 1 - this._zonePct - this._regionPct)];
    const out = [0, 0, 0];
    let leftover = 0;
    for (let t = 0; t < 3; t++) {
      if (populated[t]) out[t] = base[t];
      else leftover += base[t];
    }
    if (leftover > 0) {
      const total = out[0] + out[1] + out[2];
      if (total === 0) {
        // No configured share landed on a populated tier — cascade:
        // the empty tiers' traffic goes to the NEAREST populated lower
        // tier (zone's share → region, not straight to anywhere).
        for (let t = 0; t < 3; t++) {
          if (populated[t]) { out[t] = 1; break; }
        }
      } else {
        for (let t = 0; t < 3; t++) out[t] += (out[t] / total) * leftover;
      }
    }
    return out;
  }

  /**
   * For callers that want a hierarchical view: effective share per tier
   * given the current endpoint set (mostly for tests/dashboards).
   */
  effectiveShares(endpoints: readonly Endpoint[]): number[] {
    let pool = endpoints.filter((e) => e.healthy !== false);
    if (this._prober) {
      const p = this._prober;
      pool = pool.filter((e) => p.allows(`${e.address}:${e.port}`));
    }
    const populated = [0, 1, 2].map((t) =>
      pool.some((e) => tierOf(e, this._local) === t)
    );
    return this._effectiveShares(populated);
  }

  /**
   * Distribution check over n synthetic routing keys — test/canary aid,
   * same spirit as TrafficSplitter.distribution.
   */
  distribution(endpoints: readonly Endpoint[], n: number): Record<string, number> {
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const e = this.pick(endpoints, `key-${i}`);
      const id = e ? `${e.address}:${e.port}` : 'none';
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }
}
