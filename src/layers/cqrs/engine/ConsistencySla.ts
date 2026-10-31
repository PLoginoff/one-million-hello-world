/**
 * ConsistencySla — measured eventual-consistency lag vs a declared SLO.
 *
 * "Eventual" is meaningless without a number. This module turns each
 * projection's freshness into a measurable objective:
 *
 *   SLO(projection) = "p99 of staleness-at-read <= targetMs
 *                      over the rolling window"
 *
 * staleness-at-read is sampled on every read (or projection batch):
 *
 *   staleness = event.timestamp → appliedAt
 *   (event-time to apply-time — how old the data a reader saw was)
 *
 * Not to be confused with `ConsistencyMonitor`, which alerts on
 * POSITION lag (events behind head) with thresholds — this tracks
 * TIME lag as a distribution with a target + error budget, answering
 * "are we meeting the freshness contract?" rather than "is anything
 * behind right now?"
 *
 * Two measurements per projection:
 *   - a sliding-window percentile (P50/P95/P99 of staleness samples)
 *   - error budget: fraction of reads served within targetMs. When
 *     budget < burnThreshold the projection is "burning" — alerts.
 *
 * The sliding window is a ring buffer of samples with per-sample ms;
 * percentiles are computed on a sorted copy — O(n log n) per query on a
 * bounded n (default 512), deliberately simple: staleness tracking is
 * not the hot path, clarity beats a streaming quantile sketch here.
 *
 * @module CqrsLayer/Engine
 */

import { IClock, SystemClock } from '../../observability/engine/signals';

// ---------------------------------------------------------------------
// Config / sample
// ---------------------------------------------------------------------

export interface ProjectionSlo {
  /** The contract: p99 staleness should be <= this. */
  readonly targetMs: number;
  /**
   * Fraction of reads that may exceed targetMs before the budget is
   * "burning" (0.05 = allow 5% slow reads). Defaults to 1 - 0.99.
   */
  readonly allowedBreachFraction?: number;
  /** Samples retained per projection (ring buffer size). */
  readonly windowSize?: number;
}

interface SloState {
  readonly slo: Required<ProjectionSlo>;
  /** Ring buffer of staleness samples (ms). */
  samples: number[];
  writeIdx: number;
  filled: number;
  /** Reads within target since start (budget numerator). */
  withinTarget: number;
  /** Reads outside target since start. */
  breached: number;
  /** Sum of all samples for mean. */
  sumMs: number;
  maxMs: number;
}

export interface SloReport {
  readonly projection: string;
  readonly targetMs: number;
  readonly samples: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly meanMs: number;
  readonly maxMs: number;
  /** Fraction of reads within target (1.0 = perfect). */
  readonly withinFraction: number;
  /** Budget left: withinFraction - (1 - allowedBreachFraction). */
  readonly budgetRemaining: number;
  /** True when the breach fraction exceeds the allowed budget. */
  readonly burning: boolean;
  /** True when p99 > targetMs (the hard SLO check). */
  readonly sloMet: boolean;
}

// ---------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------

export class ConsistencySla {
  private readonly _clock: IClock;
  private readonly _states = new Map<string, SloState>();
  private readonly _defaultWindow: number;

  constructor(options: { defaultWindowSize?: number; clock?: IClock } = {}) {
    this._clock = options.clock ?? new SystemClock();
    this._defaultWindow = Math.max(8, options.defaultWindowSize ?? 512);
  }

  /** Register a projection's freshness contract. */
  register(projection: string, slo: ProjectionSlo): void {
    const windowSize = Math.max(8, slo.windowSize ?? this._defaultWindow);
    this._states.set(projection, {
      slo: {
        targetMs: slo.targetMs,
        allowedBreachFraction: slo.allowedBreachFraction ?? 0.01,
        windowSize,
      },
      samples: new Array<number>(windowSize).fill(0),
      writeIdx: 0,
      filled: 0,
      withinTarget: 0,
      breached: 0,
      sumMs: 0,
      maxMs: 0,
    });
  }

  private _state(projection: string): SloState {
    const st = this._states.get(projection);
    if (!st) throw new Error(`projection '${projection}' has no registered SLO`);
    return st;
  }

  /**
   * Record one staleness sample: `eventTimestamp` is when the source
   * event was written, `appliedAt` (default now) is when the read model
   * reflected it — the "age" of the freshest data a reader sees.
   *
   * Use for BOTH batch progress (sample each applied event) and point
   * reads (sample the checkpoint's age). Negative values (clock skew)
   * clamp to 0 — staleness can't be negative.
   */
  observe(projection: string, eventTimestamp: number, appliedAt?: number): void {
    const st = this._state(projection);
    const at = appliedAt ?? this._clock.nowMs();
    const staleness = Math.max(0, at - eventTimestamp);
    st.samples[st.writeIdx] = staleness;
    st.writeIdx = (st.writeIdx + 1) % st.slo.windowSize;
    if (st.filled < st.slo.windowSize) st.filled++;
    st.sumMs += staleness;
    if (staleness > st.maxMs) st.maxMs = staleness;
    if (staleness <= st.slo.targetMs) st.withinTarget++;
    else st.breached++;
  }

  /**
   * Convenience: sample a batch of applied events by their timestamps —
   * the common "projection applied N events" call site.
   */
  observeBatch(projection: string, eventTimestamps: readonly number[], appliedAt?: number): void {
    for (const ts of eventTimestamps) this.observe(projection, ts, appliedAt);
  }

  /** Nearest-rank percentile over the current window. O(n log n). */
  private _percentile(st: SloState, p: number): number {
    if (st.filled === 0) return 0;
    const arr = st.samples.slice(0, st.filled).sort((a, b) => a - b);
    const idx = Math.min(arr.length - 1, Math.ceil((p / 100) * arr.length) - 1);
    return arr[idx];
  }

  /** Full freshness report for one projection. */
  report(projection: string): SloReport {
    const st = this._state(projection);
    const total = st.withinTarget + st.breached;
    const withinFraction = total === 0 ? 1 : st.withinTarget / total;
    const allowed = st.slo.allowedBreachFraction;
    const p99 = this._percentile(st, 99);
    return {
      projection,
      targetMs: st.slo.targetMs,
      samples: st.filled,
      p50Ms: this._percentile(st, 50),
      p95Ms: this._percentile(st, 95),
      p99Ms: p99,
      meanMs: st.filled === 0 ? 0 : st.sumMs / Math.max(1, st.withinTarget + st.breached),
      maxMs: st.maxMs,
      withinFraction,
      budgetRemaining: withinFraction - (1 - allowed),
      burning: total > 0 && 1 - withinFraction > allowed,
      sloMet: p99 <= st.slo.targetMs,
    };
  }

  /** Every registered projection's report — the dashboard payload. */
  reportAll(): SloReport[] {
    return [...this._states.keys()].map((p) => this.report(p));
  }

  /** Projections currently burning their error budget. */
  burning(): string[] {
    return this.reportAll()
      .filter((r) => r.burning)
      .map((r) => r.projection);
  }

  /** True when every registered projection meets its p99 SLO. */
  allMet(): boolean {
    for (const p of this._states.keys()) {
      if (!this.report(p).sloMet) return false;
    }
    return true;
  }

  /**
   * EWMA of recent staleness — a smoother trend signal than raw p99,
   * useful for "is freshness getting worse" dashboards. alpha = weight
   * of the newest sample (higher = twitchier). O(filled).
   */
  ewma(projection: string, alpha = 0.3): number {
    const st = this._state(projection);
    if (st.filled === 0) return 0;
    // Walk samples oldest→newest through the ring.
    let acc = st.samples[(st.writeIdx - st.filled + st.slo.windowSize) % st.slo.windowSize];
    for (let i = 1; i < st.filled; i++) {
      const idx = (st.writeIdx - st.filled + i + st.slo.windowSize) % st.slo.windowSize;
      acc = alpha * st.samples[idx] + (1 - alpha) * acc;
    }
    return acc;
  }

  /** Reset a projection's samples (post-rebuild, config change). */
  reset(projection: string): void {
    const st = this._state(projection);
    st.samples.fill(0);
    st.writeIdx = 0;
    st.filled = 0;
    st.withinTarget = 0;
    st.breached = 0;
    st.sumMs = 0;
    st.maxMs = 0;
  }
}
