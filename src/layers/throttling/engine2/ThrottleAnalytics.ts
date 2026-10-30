/**
 * ThrottleAnalytics — consumer and rejection attribution.
 *
 * Wraps a chain (or records verdicts manually) and answers the two
 * questions ops actually asks: "who's eating the limit?" and "what's
 * rejecting traffic?"
 *
 * Two structures, both O(1) per event:
 *  - Top consumers: per-key counters over a sliding bucket window —
 *    a heap over N keys would need O(log N) per query, so instead we
 *    keep exact per-key counts in the current bucket plus the previous
 *    bucket, and compute "top K" on demand O(#keys log K) — cheap at
 *    dashboard cadence, exact within the window.
 *  - Rejection reasons: counts by `decidedBy` token, also per bucket,
 *    so "rejections spiked on tier:free at 14:00" is answerable without
 *    log diving.
 *
 * Buckets rotate on access (lazy). `snapshot` rolls a window: last
 * `bucketsKept` buckets merged, optionally weighted by recency.
 *
 * @module ThrottlingLayer/Engine2
 */

import { ThrottleClock2, SystemThrottleClock2, ThrottleVerdict } from './types';

export interface AnalyticsEvent {
  readonly key: string;
  readonly verdict: ThrottleVerdict;
  /** Units consumed (default 1). */
  readonly cost?: number;
}

export interface TopConsumer {
  readonly key: string;
  readonly allowed: number;
  readonly denied: number;
  readonly total: number;
}

export interface ReasonBreakdown {
  readonly reason: string;
  readonly count: number;
}

export interface ThrottleAnalyticsOptions {
  /** Bucket length in ms. Default 60_000. */
  bucketMs?: number;
  /** Buckets retained for snapshots. Default 15. */
  bucketsKept?: number;
  clock?: ThrottleClock2;
}

interface Bucket {
  start: number;
  /** key → {allowed, denied} */
  keys: Map<string, { allowed: number; denied: number }>;
  /** reason → count */
  reasons: Map<string, number>;
}

export class ThrottleAnalytics {
  private readonly _bucketMs: number;
  private readonly _bucketsKept: number;
  private readonly _clock: ThrottleClock2;
  private _buckets: Bucket[] = [];

  constructor(opts: ThrottleAnalyticsOptions = {}) {
    this._bucketMs = opts.bucketMs ?? 60_000;
    this._bucketsKept = Math.max(1, opts.bucketsKept ?? 15);
    this._clock = opts.clock ?? new SystemThrottleClock2();
  }

  /** Record one verdict. O(1). */
  record(ev: AnalyticsEvent): void {
    const b = this._bucket();
    const cost = ev.cost ?? 1;
    const e = b.keys.get(ev.key) ?? { allowed: 0, denied: 0 };
    if (ev.verdict.allowed) e.allowed += cost;
    else {
      e.denied += cost;
      const r = ev.verdict.decidedBy;
      b.reasons.set(r, (b.reasons.get(r) ?? 0) + 1);
    }
    b.keys.set(ev.key, e);
  }

  /** Top K consumers across the retained window (allowed+denied). */
  topConsumers(k: number): TopConsumer[] {
    const merged = new Map<string, { allowed: number; denied: number }>();
    for (const b of this._retained()) {
      for (const [key, e] of b.keys) {
        const m = merged.get(key) ?? { allowed: 0, denied: 0 };
        m.allowed += e.allowed;
        m.denied += e.denied;
        merged.set(key, m);
      }
    }
    return [...merged.entries()]
      .map(([key, e]) => ({ key, ...e, total: e.allowed + e.denied }))
      .sort((a, b) => b.total - a.total)
      .slice(0, k);
  }

  /** Rejection counts by decidedBy token across the retained window. */
  rejectionBreakdown(): ReasonBreakdown[] {
    const merged = new Map<string, number>();
    for (const b of this._retained()) {
      for (const [r, n] of b.reasons) merged.set(r, (merged.get(r) ?? 0) + n);
    }
    return [...merged.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Per-bucket rejection series for charting (oldest first). */
  rejectionSeries(): Array<{ start: number; reasons: ReasonBreakdown[] }> {
    return this._retained().map((b) => ({
      start: b.start,
      reasons: [...b.reasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b2) => b2.count - a.count),
    }));
  }

  private _bucket(): Bucket {
    const start = Math.floor(this._clock.now() / this._bucketMs) * this._bucketMs;
    const last = this._buckets[this._buckets.length - 1];
    if (!last || last.start !== start) {
      this._buckets.push({ start, keys: new Map(), reasons: new Map() });
      if (this._buckets.length > this._bucketsKept) {
        this._buckets.splice(0, this._buckets.length - this._bucketsKept);
      }
      return this._buckets[this._buckets.length - 1];
    }
    return last;
  }

  /** Buckets whose windows overlap the retained span (lazy GC). */
  private _retained(): Bucket[] {
    const cutoff = this._clock.now() - this._bucketsKept * this._bucketMs;
    while (this._buckets.length && this._buckets[0].start < cutoff) this._buckets.shift();
    return this._buckets;
  }
}
