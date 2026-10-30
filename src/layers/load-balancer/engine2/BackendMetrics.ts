/**
 * BackendMetrics — per-backend load metrics with latency percentiles.
 *
 * Tracks, per backend:
 *  - request counts (total, ok, error) and current inflight
 *  - requests-per-second over a rolling window
 *  - latency percentiles (p50/p90/p95/p99) over a fixed-size reservoir
 *
 * Latency uses a bounded reservoir with *random replacement* (Vitter's
 * Algorithm R flavor): once the reservoir is full, the nth sample
 * replaces a random slot with probability capacity/n. This keeps the
 * sample approximately uniform over recent history in O(1) per sample
 * with O(capacity) memory — no sorting per request.
 *
 * RPS uses a ring of 1-second buckets: O(1) record, O(windowSec) query.
 *
 * Percentile math is nearest-rank over the sorted reservoir copy:
 * O(capacity log capacity) per query — cheap at reservoir sizes ≤ 4096.
 *
 * @module LoadBalancerLayer/Engine2
 */

import { LbClock2, SystemLbClock2 } from './types';

export interface BackendMetricsOptions {
  /** Latency reservoir capacity per backend. Default 1024. */
  reservoirSize?: number;
  /** RPS rolling window in seconds. Default 60. */
  rpsWindowSec?: number;
  /** RNG for reservoir replacement (injectable for tests). */
  rng?: () => number;
  clock?: LbClock2;
}

export interface LatencyStats {
  readonly count: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

export interface BackendLoadSnapshot {
  readonly backendId: string;
  readonly total: number;
  readonly ok: number;
  readonly errors: number;
  readonly inflight: number;
  readonly rps: number;
  readonly latency: LatencyStats;
}

interface BackendData {
  total: number;
  ok: number;
  errors: number;
  inflight: number;
  reservoir: number[];
  /** Number of latency samples ever seen (reservoir may hold fewer). */
  samplesSeen: number;
  /** Ring of per-second request counters, indexed by epochSecond % size. */
  secBuckets: { epochSec: number; count: number }[];
}

export class BackendMetrics {
  private readonly _reservoirSize: number;
  private readonly _windowSec: number;
  private readonly _rng: () => number;
  private readonly _clock: LbClock2;
  private readonly _data = new Map<string, BackendData>();

  constructor(opts: BackendMetricsOptions = {}) {
    this._reservoirSize = Math.max(16, opts.reservoirSize ?? 1024);
    this._windowSec = Math.max(1, Math.floor(opts.rpsWindowSec ?? 60));
    this._rng = opts.rng ?? Math.random;
    this._clock = opts.clock ?? new SystemLbClock2();
  }

  /** Register a backend (idempotent). */
  track(backendId: string): void {
    if (!this._data.has(backendId)) {
      this._data.set(backendId, {
        total: 0,
        ok: 0,
        errors: 0,
        inflight: 0,
        reservoir: [],
        samplesSeen: 0,
        secBuckets: Array.from({ length: this._windowSec }, () => ({
          epochSec: -1,
          count: 0,
        })),
      });
    }
  }

  untrack(backendId: string): boolean {
    return this._data.delete(backendId);
  }

  /** Record the start of a request — bumps inflight and RPS counters. */
  recordStart(backendId: string): void {
    const d = this._data.get(backendId);
    if (!d) return;
    d.inflight++;
    d.total++;
    const epochSec = Math.floor(this._clock.now() / 1000);
    const slot = d.secBuckets[epochSec % this._windowSec];
    if (slot.epochSec !== epochSec) {
      slot.epochSec = epochSec;
      slot.count = 0;
    }
    slot.count++;
  }

  /** Record request completion. `latencyMs` feeds the reservoir. */
  recordEnd(backendId: string, ok: boolean, latencyMs: number): void {
    const d = this._data.get(backendId);
    if (!d) return;
    d.inflight = Math.max(0, d.inflight - 1);
    if (ok) d.ok++;
    else d.errors++;
    this._offerSample(d, Math.max(0, latencyMs));
  }

  /** Convenience: wrap a synchronous call with start/end recording. */
  time<R>(backendId: string, fn: () => R): R {
    const started = this._clock.now();
    this.recordStart(backendId);
    try {
      const out = fn();
      this.recordEnd(backendId, true, this._clock.now() - started);
      return out;
    } catch (err) {
      this.recordEnd(backendId, false, this._clock.now() - started);
      throw err;
    }
  }

  /** Requests per second averaged over the rolling window. */
  rps(backendId: string): number {
    const d = this._data.get(backendId);
    if (!d) return 0;
    const nowSec = Math.floor(this._clock.now() / 1000);
    let sum = 0;
    for (const b of d.secBuckets) {
      if (b.epochSec > nowSec - this._windowSec) sum += b.count;
    }
    return sum / this._windowSec;
  }

  /** Percentile stats over the latency reservoir. */
  latency(backendId: string): LatencyStats {
    const d = this._data.get(backendId);
    if (!d || d.reservoir.length === 0) {
      return { count: 0, minMs: 0, maxMs: 0, meanMs: 0, p50Ms: 0, p90Ms: 0, p95Ms: 0, p99Ms: 0 };
    }
    const sorted = [...d.reservoir].sort((a, b) => a - b);
    const n = sorted.length;
    const rank = (p: number): number => {
      // Nearest-rank: p50 → index ceil(0.5n)-1 etc.
      const idx = Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1));
      return sorted[idx];
    };
    let sum = 0;
    for (const v of sorted) sum += v;
    return {
      count: n,
      minMs: sorted[0],
      maxMs: sorted[n - 1],
      meanMs: sum / n,
      p50Ms: rank(0.5),
      p90Ms: rank(0.9),
      p95Ms: rank(0.95),
      p99Ms: rank(0.99),
    };
  }

  /** Combined snapshot for dashboards. */
  snapshot(backendId: string): BackendLoadSnapshot | null {
    const d = this._data.get(backendId);
    if (!d) return null;
    return {
      backendId,
      total: d.total,
      ok: d.ok,
      errors: d.errors,
      inflight: d.inflight,
      rps: this.rps(backendId),
      latency: this.latency(backendId),
    };
  }

  /** Snapshots for all tracked backends. */
  snapshots(): BackendLoadSnapshot[] {
    const out: BackendLoadSnapshot[] = [];
    for (const id of this._data.keys()) {
      const s = this.snapshot(id);
      if (s) out.push(s);
    }
    return out;
  }

  /* ---------------------------------------------------------------- */

  /**
   * Reservoir sampling: keep the first `capacity` samples; afterwards the
   * nth sample replaces a uniformly random slot with probability
   * capacity/n. O(1) per sample, bounded memory, statistically uniform.
   */
  private _offerSample(d: BackendData, ms: number): void {
    d.samplesSeen++;
    if (d.reservoir.length < this._reservoirSize) {
      d.reservoir.push(ms);
      return;
    }
    const slot = Math.floor(this._rng() * d.samplesSeen);
    if (slot < this._reservoirSize) {
      d.reservoir[slot] = ms;
    }
  }
}
