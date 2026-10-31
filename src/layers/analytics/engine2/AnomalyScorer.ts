/**
 * Anomaly Scorer — Seasonal Baseline Deviation Detection
 *
 * Dashboard metrics have daily/weekly seasonality: comparing this
 * hour to the last hour produces noise; comparing it to the same
 * hour yesterday and last week produces signal. This scorer keeps a
 * seasonal decomposition baseline and scores each new observation by
 * its deviation from the expected band.
 *
 * Model per metric + season-slot (e.g. hour-of-week = 168 slots):
 *
 *  - Baseline: EWMA mean μ and EWMA variance σ² of the slot's
 *    residuals over `seasons` past observations. Variance uses the
 *    standard online recurrence (West, 1979):
 *
 *        μ_n = μ + α(x − μ)
 *        s²_n = (1−α)(s² + α(x − μ)²)
 *
 *  - Score: z = (x − μ) / σ, flagged when |z| ≥ threshold AND the
 *    slot has enough history (`minSeasons`) to be meaningful.
 *
 *  - Optional trend: a second EWMA tracks drift in the baseline
 *    itself so a slowly-rising metric isn't perpetually "anomalous".
 *
 * Unlike the audit layer's anomaly detector (discrete signals over
 * event volumes), this scores continuous metric values — the two
 * share nothing but vocabulary.
 *
 * Complexity: observe O(1) amortized; score O(1).
 *
 * @module AnalyticsLayer/Engine2
 */

import { AnalyticsClock2, SystemAnalyticsClock2 } from './types';

/** Season granularity — how the cycle is partitioned into slots. */
export type SeasonKind = 'hour-of-day' | 'hour-of-week' | 'day-of-week';

const SLOT_COUNTS: Record<SeasonKind, number> = {
  'hour-of-day': 24,
  'hour-of-week': 168,
  'day-of-week': 7,
};

const SLOT_MS: Record<SeasonKind, number> = {
  'hour-of-day': 3_600_000,
  'hour-of-week': 3_600_000,
  'day-of-week': 86_400_000,
};

export interface AnomalyScorerOptions {
  /** Which seasonal cycle to decompose on. */
  readonly season: SeasonKind;
  /** EWMA smoothing for baseline mean/variance (default 0.1). */
  readonly alpha?: number;
  /** |z| threshold for flagging (default 3). */
  readonly zThreshold?: number;
  /** Minimum slot observations before scoring is trusted (default 3). */
  readonly minSeasons?: number;
  readonly clock?: AnalyticsClock2;
}

interface SlotStats {
  n: number;
  mean: number;
  /** EWMA-scaled variance accumulator (s² from West recurrence). */
  m2: number;
  /** Trend EWMA on mean drift; 0 = untracked. */
  trend: number;
}

export interface AnomalyScore {
  readonly metric: string;
  readonly timestamp: number;
  readonly value: number;
  /** Season slot the observation fell into. */
  readonly slot: number;
  /** z-score vs the slot baseline; NaN while under minSeasons. */
  readonly z: number;
  /** True when |z| >= threshold with enough history. */
  readonly anomalous: boolean;
  /** Slot baseline mean used for scoring. */
  readonly baseline: number;
  /** Slot standard deviation used for scoring. */
  readonly stddev: number;
}

export class AnomalyScorer {
  private readonly season: SeasonKind;
  private readonly alpha: number;
  private readonly zThreshold: number;
  private readonly minSeasons: number;
  private readonly clock: AnalyticsClock2;
  private readonly slots = new Map<string, SlotStats[]>();

  constructor(options: AnomalyScorerOptions) {
    this.season = options.season;
    this.alpha = options.alpha ?? 0.1;
    if (this.alpha <= 0 || this.alpha > 1) throw new Error('alpha must be in (0,1]');
    this.zThreshold = options.zThreshold ?? 3;
    this.minSeasons = options.minSeasons ?? 3;
    this.clock = options.clock ?? new SystemAnalyticsClock2();
  }

  /** Which slot a timestamp belongs to. */
  slotOf(timestamp: number): number {
    const dayMs = 86_400_000;
    const weekMs = 7 * dayMs;
    switch (this.season) {
      case 'hour-of-day': {
        const m = ((timestamp % dayMs) + dayMs) % dayMs;
        return Math.floor(m / SLOT_MS['hour-of-day']);
      }
      case 'day-of-week': {
        // Unix epoch was Thursday (day 4); normalize so slot 0 = Thursday.
        const m = ((timestamp % weekMs) + weekMs) % weekMs;
        return Math.floor(m / SLOT_MS['day-of-week']);
      }
      case 'hour-of-week': {
        const m = ((timestamp % weekMs) + weekMs) % weekMs;
        return Math.floor(m / SLOT_MS['hour-of-week']);
      }
    }
  }

  /**
   * Score an observation WITHOUT updating the baseline — a lookahead
   * for "what would the score be" checks.
   */
  score(metric: string, value: number, timestamp?: number): AnomalyScore {
    const ts = timestamp ?? this.clock.now();
    const slot = this.slotOf(ts);
    const s = this.slotStats(metric, slot);
    return this.buildScore(metric, ts, value, slot, s);
  }

  /**
   * Score then fold the observation into the slot baseline — the
   * normal streaming path. Baseline updates happen *after* scoring
   * so an anomaly doesn't pollute its own detection.
   */
  observe(metric: string, value: number, timestamp?: number): AnomalyScore {
    const ts = timestamp ?? this.clock.now();
    const slot = this.slotOf(ts);
    const slots = this.metricSlots(metric);
    const s = slots[slot]!;
    const score = this.buildScore(metric, ts, value, slot, s);

    // Online mean/variance (West 1979) over the slot. The first
    // observation seeds the baseline directly — EWMA-from-zero
    // would bias every slot's early life toward low means.
    if (s.n === 0) {
      s.mean = value;
      s.n = 1;
      return score;
    }
    const n = s.n + 1;
    const delta = value - s.mean;
    const mean = s.mean + this.alpha * delta;
    s.m2 = (1 - this.alpha) * (s.m2 + this.alpha * delta * delta);
    // Trend tracks drift of the slot mean itself.
    s.trend = this.alpha * (mean - s.mean) + (1 - this.alpha) * s.trend;
    s.mean = mean;
    s.n = n;
    return score;
  }

  /** Current baseline for a metric+slot (undefined when unseen). */
  baseline(metric: string, slot: number): { mean: number; stddev: number; n: number } | undefined {
    const s = this.slots.get(metric)?.[slot];
    if (!s || s.n === 0) return undefined;
    return { mean: s.mean, stddev: Math.sqrt(Math.max(0, s.m2)), n: s.n };
  }

  /** Tracked metrics. */
  metrics(): string[] {
    return [...this.slots.keys()];
  }

  private metricSlots(metric: string): SlotStats[] {
    let arr = this.slots.get(metric);
    if (!arr) {
      const size = SLOT_COUNTS[this.season];
      arr = new Array<SlotStats>(size);
      for (let i = 0; i < size; i++) arr[i] = { n: 0, mean: 0, m2: 0, trend: 0 };
      this.slots.set(metric, arr);
    }
    return arr;
  }

  private slotStats(metric: string, slot: number): SlotStats {
    return this.metricSlots(metric)[slot]!;
  }

  private buildScore(
    metric: string,
    ts: number,
    value: number,
    slot: number,
    s: SlotStats
  ): AnomalyScore {
    if (s.n < this.minSeasons) {
      return {
        metric,
        timestamp: ts,
        value,
        slot,
        z: Number.NaN,
        anomalous: false,
        baseline: s.mean,
        stddev: Math.sqrt(Math.max(0, s.m2)),
      };
    }
    const stddev = Math.sqrt(Math.max(0, s.m2));
    // Guard zero-variance slots: exact-repeat baselines make z explode
    // on any deviation; cap the effective sigma at a small fraction
    // of the mean magnitude (or 1 for zero-mean metrics).
    const sigma = Math.max(stddev, Math.abs(s.mean) * 0.001, 1e-9);
    const z = (value - s.mean) / sigma;
    return {
      metric,
      timestamp: ts,
      value,
      slot,
      z,
      anomalous: Math.abs(z) >= this.zThreshold,
      baseline: s.mean,
      stddev: sigma,
    };
  }
}
