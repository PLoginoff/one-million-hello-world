/**
 * DLQ Trend Analytics
 *
 * The second half of "DLQ analytics": not just *why* things die
 * (clusters + top reasons) but *how the queue is trending* — is the
 * backlog growing, shrinking, and at what rate; how old are the
 * records inside it; and which origins feed it most.
 *
 * Algorithms:
 *   - Age histogram: fixed-bucket counts over `enqueuedAt` — the
 *     distribution a "queue age" question actually asks. Bucketing is
 *     O(R) single-pass; boundary convention [lo, hi) keeps it exact.
 *   - Arrival rate: least-squares slope of cumulative enqueues over a
 *     window — same OLS estimator as the message-bus lag tracker,
 *     applied to `enqueuedAt` vs. running count. Robust to irregular
 *     sampling.
 *   - Drain forecast: remaining / net rate (arrival − replay), giving
 *     "at the current pace, the queue empties in X" or "never, it is
 *     growing".
 *
 * @module DeadLetterLayer/Engine2
 */

import { DlqClock2, Engine2Record, SystemDlqClock2 } from './types';
import { RecordStore } from './RecordStore';

export interface AgeBucket {
  /** Records aged lo ≤ age < hi (ms). The last bucket is hi=Infinity. */
  readonly lo: number;
  readonly hi: number;
  readonly count: number;
}

export interface TrendReport {
  readonly queue: string;
  readonly depth: number;
  /** Oldest pending record age in ms; null when empty. */
  readonly oldestAgeMs: number | null;
  /** Records enqueued per ms over the observed window (OLS slope). */
  readonly arrivalRatePerMs: number | null;
  /** Projected ms to empty at current net rate; null when not draining. */
  readonly etaMs: number | null;
  readonly ages: readonly AgeBucket[];
}

/**
 * Age histogram over pending records. `boundaries` are ascending ms
 * cutoffs; a record aged `a` lands in the first bucket with `hi > a`.
 * Always emits an open-ended tail bucket.
 */
export function ageHistogram(
  records: readonly Pick<Engine2Record, 'enqueuedAt'>[],
  now: number,
  boundaries: readonly number[] = [60_000, 300_000, 900_000, 3_600_000]
): AgeBucket[] {
  const buckets: { lo: number; hi: number; count: number }[] = [];
  let lo = 0;
  for (const hi of boundaries) {
    buckets.push({ lo, hi, count: 0 });
    lo = hi;
  }
  buckets.push({ lo, hi: Number.POSITIVE_INFINITY, count: 0 });
  for (const r of records) {
    const age = now - r.enqueuedAt;
    const i = buckets.findIndex((b) => age < b.hi);
    const b = buckets[i === -1 ? buckets.length - 1 : i];
    if (b) b.count++;
  }
  return buckets;
}

/**
 * OLS arrival rate from enqueuedAt timestamps: how fast records were
 * arriving across the observed set, in records/ms. Treats the sorted
 * enqueue times as samples of cumulative count vs. time.
 */
export function arrivalRatePerMs(
  enqueuedAts: readonly number[]
): number | null {
  const n = enqueuedAts.length;
  if (n < 2) return null;
  const sorted = [...enqueuedAts].sort((a, b) => a - b);
  // y = index (cumulative count), x = time. OLS slope = records/ms.
  let sx = 0;
  let sy = 0;
  sorted.forEach((t, i) => {
    sx += t;
    sy += i;
  });
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  sorted.forEach((t, i) => {
    const dx = t - mx;
    num += dx * (i - my);
    den += dx * dx;
  });
  if (den === 0) return null;
  return num / den;
}

export class DlqAnalytics {
  private readonly _store: RecordStore;
  private readonly _clock: DlqClock2;
  /** Rolling replay-out events per queue for drain-rate math. */
  private readonly _replayed = new Map<string, number[]>();

  constructor(store: RecordStore, clock: DlqClock2 = new SystemDlqClock2()) {
    this._store = store;
    this._clock = clock;
  }

  /** Record that a record left the queue via replay (drives drain rate). */
  recordReplayed(queue: string, at?: number): void {
    const list = this._replayed.get(queue) ?? [];
    list.push(at ?? this._clock.now());
    this._replayed.set(queue, list);
  }

  /** Full trend report for one queue. */
  trend(queue: string, boundaries?: readonly number[]): TrendReport {
    const now = this._clock.now();
    const pending = this._store.list(queue, 'pending');
    const depth = pending.length;
    const oldest = pending.length
      ? now - Math.min(...pending.map((r) => r.enqueuedAt))
      : null;

    const arrival = arrivalRatePerMs(pending.map((r) => r.enqueuedAt));
    // Drain rate: replays per ms over the same observed span.
    const spanMs =
      pending.length > 1
        ? now - Math.min(...pending.map((r) => r.enqueuedAt))
        : 0;
    const replays = this._replayed.get(queue) ?? [];
    const drainRate = spanMs > 0 ? replays.length / spanMs : 0;
    const net = arrival === null ? null : drainRate - arrival;
    const eta =
      depth > 0 && net !== null && net > 0 ? Math.ceil(depth / net) : null;

    return {
      queue,
      depth,
      oldestAgeMs: oldest,
      arrivalRatePerMs: arrival,
      etaMs: eta,
      ages: ageHistogram(pending, now, boundaries),
    };
  }

  /** Which origins currently feed this queue, ranked. */
  topOrigins(queue: string): Array<{ origin: string; count: number }> {
    const counts = new Map<string, number>();
    for (const r of this._store.list(queue, 'pending')) {
      counts.set(r.origin, (counts.get(r.origin) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([origin, count]) => ({ origin, count }))
      .sort((a, b) => b.count - a.count || a.origin.localeCompare(b.origin));
  }
}
