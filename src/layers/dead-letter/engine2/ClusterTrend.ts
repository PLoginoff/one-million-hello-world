/**
 * Cluster Trend Analysis
 *
 * Beyond "which failures exist" (ErrorClusters) — "which failures are
 * NEW, ACCELERATING, or DYING OUT". Each cluster gets a trend read from
 * its member timestamps: a cluster whose failures all arrived in the
 * last window is `new`; one whose recent-window share of members
 * exceeds its age-share is `accelerating`; one silent for the window
 * is `cooling`.
 *
 * Trending rules (window = the trailing `windowMs` before `now`):
 *   - `new`         — firstSeenAt inside the window.
 *   - `accelerating`— inside-window share of members ≥ 2× the window's
 *                     share of the cluster's observed lifespan.
 *   - `cooling`     — zero members inside the window.
 *   - `steady`      — everything else.
 *
 * Buckets by signature only need the signature + timestamps — no
 * payload access — so trending stays cheap and PII-free like the
 * clusterer itself.
 *
 * @module DeadLetterLayer/Engine2
 */

import { DlqClock2, SystemDlqClock2 } from './types';
import { Cluster } from './ErrorClusters';

export type ClusterTrend = 'new' | 'accelerating' | 'steady' | 'cooling';

export interface TrendedCluster {
  readonly signature: string;
  readonly trend: ClusterTrend;
  readonly count: number;
  readonly recentCount: number;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  /** Members inside the trailing window. */
  readonly windowShare: number;
}

export function trendClusters(
  clusters: readonly Cluster[],
  clock: DlqClock2 = new SystemDlqClock2(),
  windowMs = 3_600_000
): TrendedCluster[] {
  const now = clock.now();
  const cutoff = now - windowMs;
  return clusters
    .map((c) => {
      const recent = c.members.filter((m) => m.failedAt >= cutoff).length;
      const lifespan = Math.max(1, now - c.firstSeenAt);
      const windowShare = recent / c.count;
      const lifespanShare = Math.min(1, windowMs / lifespan);
      let trend: ClusterTrend;
      if (c.firstSeenAt >= cutoff) trend = 'new';
      else if (recent === 0) trend = 'cooling';
      else if (windowShare >= 2 * lifespanShare) trend = 'accelerating';
      else trend = 'steady';
      return {
        signature: c.signature,
        trend,
        count: c.count,
        recentCount: recent,
        firstSeenAt: c.firstSeenAt,
        lastSeenAt: c.lastSeenAt,
        windowShare,
      };
    })
    // Accelerating/new surface first — the page-worthy changes.
    .sort((a, b) => rank(b.trend) - rank(a.trend) || b.recentCount - a.recentCount);
}

function rank(t: ClusterTrend): number {
  switch (t) {
    case 'accelerating': return 3;
    case 'new': return 2;
    case 'steady': return 1;
    case 'cooling': return 0;
  }
}
