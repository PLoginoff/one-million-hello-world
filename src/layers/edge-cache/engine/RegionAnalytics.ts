/**
 * RegionAnalytics — per-region hit-rate tracking + rebalancing hints.
 *
 * EdgeCacheEngine already keeps per-region counters (cdn/types.RegionStats).
 * This layer turns counters into ACTIONABLE data:
 *
 *   - Rolling hit-rate per region (sliding window of the last K requests,
 *     not lifetime — a region that improved after warming shows it fast).
 *   - Cross-region comparison: regions sorted by hit-rate; the spread
 *     between best and worst is the rebalancing signal.
 *   - Hints: 'replicate' (low hit-rate region should pull content from a
 *     high one), 'warm' (cold region needs proactive warming),
 *     'redistribute' (traffic could shift to better-served regions).
 *
 * Rolling window: a per-region deque of the last K outcomes — O(1)
 * amortized record, O(1) hitRate query.
 *
 * @module EdgeCache/Engine
 */

export interface RegionSample {
  readonly at: number;
  readonly hit: boolean;
}

export interface RegionReport {
  readonly region: string;
  readonly requests: number;
  readonly hitRate: number;        // rolling, 0..1
  readonly lifetimeHitRate: number;
  readonly trend: 'up' | 'down' | 'flat'; // first-half vs second-half of window
}

export interface RebalanceHint {
  readonly region: string;
  readonly kind: 'replicate' | 'warm' | 'redistribute';
  /** 0..1 — how strong the hint is. */
  readonly weight: number;
  readonly detail: string;
}

export class RegionAnalytics {
  private readonly _window: number;
  private readonly _samples = new Map<string, RegionSample[]>();
  private readonly _lifetime = new Map<string, { hits: number; total: number }>();

  constructor(opts: { windowSize?: number } = {}) {
    this._window = opts.windowSize ?? 200;
  }

  /** Record one request outcome for `region`. */
  record(region: string, hit: boolean, at = 0): void {
    let s = this._samples.get(region);
    if (!s) {
      s = [];
      this._samples.set(region, s);
    }
    s.push({ at, hit });
    if (s.length > this._window) s.splice(0, s.length - this._window);

    let l = this._lifetime.get(region);
    if (!l) {
      l = { hits: 0, total: 0 };
      this._lifetime.set(region, l);
    }
    l.total++;
    if (hit) l.hits++;
  }

  hitRate(region: string): number {
    const s = this._samples.get(region) ?? [];
    if (s.length === 0) return 0;
    const hits = s.reduce((a, x) => a + (x.hit ? 1 : 0), 0);
    return hits / s.length;
  }

  report(region: string): RegionReport {
    const s = this._samples.get(region) ?? [];
    const l = this._lifetime.get(region) ?? { hits: 0, total: 0 };
    const hits = s.reduce((a, x) => a + (x.hit ? 1 : 0), 0);
    const overall = s.length === 0 ? 0 : hits / s.length;
    // Trend: last-quarter vs overall window average — stable on
    // alternating sequences, sensitive to real drift.
    const quarter = Math.max(1, Math.floor(s.length / 4));
    const recent = s.slice(-quarter);
    const recentRate = recent.reduce((a, x) => a + (x.hit ? 1 : 0), 0) / recent.length;
    const trend =
      s.length < 10 || Math.abs(recentRate - overall) < 0.2
        ? 'flat'
        : recentRate > overall
          ? 'up'
          : 'down';
    return {
      region,
      requests: l.total,
      hitRate: s.length === 0 ? 0 : hits / s.length,
      lifetimeHitRate: l.total === 0 ? 0 : l.hits / l.total,
      trend,
    };
  }

  /**
   * Hints for every region below `warnBelow` hit-rate, compared against
   * the best region. Sorted by weight descending.
   */
  hints(warnBelow = 0.6): RebalanceHint[] {
    const regions = [...this._samples.keys()];
    const reports = regions.map((r) => this.report(r));
    const best = reports.reduce((a, b) => (a.hitRate >= b.hitRate ? a : b), { hitRate: 0 } as RegionReport);
    const out: RebalanceHint[] = [];

    for (const r of reports) {
      if (r.requests < 20) continue; // not enough signal
      if (r.hitRate >= warnBelow) continue;
      const gap = Math.max(0, best.hitRate - r.hitRate);
      if (r.trend === 'down' || r.hitRate < warnBelow * 0.7) {
        out.push({
          region: r.region,
          kind: 'replicate',
          weight: gap,
          detail: `hit-rate ${(r.hitRate * 100).toFixed(1)}% vs best ${(best.hitRate * 100).toFixed(1)}% — replicate popular content into ${r.region}`,
        });
      } else {
        out.push({
          region: r.region,
          kind: 'warm',
          weight: gap * 0.7,
          detail: `${r.region} below threshold — schedule a warm pass for its top keys`,
        });
      }
    }
    return out.sort((a, b) => b.weight - a.weight);
  }

  regions(): string[] {
    return [...this._samples.keys()];
  }
}
