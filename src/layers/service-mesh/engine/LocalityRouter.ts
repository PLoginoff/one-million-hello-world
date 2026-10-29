/**
 * Locality-Aware & Weighted Routing
 *
 * Two load-balancing decisions live here:
 *
 * 1. `LocalityRouter.pick()` — topology-aware endpoint selection.
 *    Endpoints in the same region+zone as the caller are preferred.
 *    Within a locality, selection is weighted round-robin; when local
 *    endpoints are exhausted (or absent), traffic spills to the next
 *    nearest locality (zone → region → anywhere). This is the "locality
 *    weighted" mode used by Envoy's `localityWeightedLbConfig`.
 *
 * 2. `TrafficSplitter.pick()` — deterministic weighted choice between
 *    version clusters using a stable hash of a routing key (session id,
 *    user id). Sticky: the same key always lands on the same version
 *    while weights are unchanged, so a 10% canary keeps its users.
 *
 * @module ServiceMeshLayer/Engine
 */

import { Endpoint, WeightedCluster } from './config-model';
import { fnv1a32 } from '../../observability/engine/SamplingStrategies';
import { OutlierDetector } from './HealthTracker';

export interface Locality {
  region: string;
  zone: string;
  subzone?: string;
}

function localityRank(a: Locality | undefined, b: Locality): number {
  if (!a) return 0;
  let score = 0;
  if (a.region === b.region) score += 100;
  if (a.zone === b.zone) score += 10;
  if (a.subzone && a.subzone === b.subzone) score += 1;
  return score;
}

/**
 * Chooses among endpoints preferring same-locality, weighted, healthy
 * candidates. The `OutlierDetector` (optional) filters ejected
 * endpoints before selection.
 */
export class LocalityRouter {
  private readonly _local: Locality;
  private readonly _detector?: OutlierDetector;
  /** Weighted-round-robin cursors per locality bucket. */
  private _rrCursor = 0;

  constructor(local: Locality, detector?: OutlierDetector) {
    this._local = local;
    this._detector = detector;
  }

  /**
   * Pick an endpoint. `null` means no eligible endpoint exists.
   * Complexity: O(n log n) due to the sort — endpoints per cluster are
   * typically < 50 so this is cheap; caching per generation would scale
   * further.
   */
  pick(endpoints: ReadonlyArray<Endpoint>): Endpoint | null {
    let pool = endpoints.filter((e) => e.healthy !== false);
    const detector = this._detector;
    if (detector) {
      pool = pool.filter((e) => !detector.isEjected(`${e.address}:${e.port}`));
    }
    if (pool.length === 0) return null;

    // Sort by locality score descending, then by weight descending.
    const scored = pool
      .map((e) => ({ e, rank: localityRank(e.locality, this._local) }))
      .sort((x, y) => y.rank - x.rank || (y.e.weight ?? 1) - (x.e.weight ?? 1));

    // Take the top locality tier only.
    const topRank = scored[0].rank;
    const top = scored.filter((s) => s.rank === topRank).map((s) => s.e);

    // Weighted round-robin within the tier: repeat each endpoint
    // `weight` times in the pool.
    const pool2: Endpoint[] = [];
    for (const e of top) {
      const w = Math.max(1, e.weight ?? 1);
      for (let i = 0; i < w; i++) pool2.push(e);
    }
    const picked = pool2[this._rrCursor % pool2.length];
    this._rrCursor = (this._rrCursor + 1) % 1_000_000;
    return picked;
  }
}

/**
 * Deterministic traffic splitter. `pick(key)` hashes the key into
 * [0,100) and walks the cumulative weights — same key + same config →
 * same result (sticky sessions). Rebalancing weights reshuffles only
 * the fraction of keys that crossed a boundary.
 */
export class TrafficSplitter {
  private readonly _clusters: ReadonlyArray<WeightedCluster>;
  private readonly _cumulative: ReadonlyArray<number>;

  constructor(clusters: ReadonlyArray<WeightedCluster>) {
    const sorted = [...clusters].sort((a, b) => a.name.localeCompare(b.name));
    const total = sorted.reduce((a, c) => a + c.weight, 0);
    if (total !== 100) {
      throw new Error(`traffic split weights sum to ${total}, expected 100`);
    }
    this._clusters = sorted;
    const cum: number[] = [];
    let acc = 0;
    for (const c of sorted) {
      acc += c.weight;
      cum.push(acc);
    }
    this._cumulative = cum;
  }

  /** Returns the cluster a routing key lands on. */
  pick(routingKey: string): WeightedCluster {
    const bucket = (fnv1a32(routingKey) % 10000) / 100; // 0.00–99.99
    for (let i = 0; i < this._cumulative.length; i++) {
      if (bucket < this._cumulative[i]) return this._clusters[i];
    }
    return this._clusters[this._clusters.length - 1];
  }

  /**
   * Rough distribution check over `n` random keys — used in tests and
   * for canary health dashboards.
   */
  distribution(n: number): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const c of this._clusters) counts[c.name] = 0;
    for (let i = 0; i < n; i++) {
      counts[this.pick(`key-${i}`).name]++;
    }
    return counts;
  }
}
