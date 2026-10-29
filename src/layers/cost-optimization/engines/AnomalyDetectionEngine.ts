/**
 * Spend Anomaly Detection Engine
 *
 * Flags anomalous spend events per cost center using z-scores over a
 * trailing baseline window:
 *
 *   z = (x - μ) / σ
 *
 * where μ and σ are the mean and population standard deviation of the
 * cost center's previous samples within the baseline window. Events with
 * |z| ≥ threshold are anomalies; sign determines spike vs drop.
 *
 * The baseline excludes the candidate point itself (each event is scored
 * against the history that preceded it), so a sustained step-change
 * produces anomalies at first then becomes the new baseline — matching
 * how real cost-anomaly systems (AWS Cost Anomaly Detection etc.) behave.
 *
 * Complexity: O(W) per event where W = baseline samples in the window.
 *
 * @module CostOptimizationLayer/Engines
 */

import { IClock, SpendAnomaly, SpendRecord, SystemClock } from './types';

export interface AnomalyConfig {
  /** Baseline look-back window in ms. */
  windowMs: number;
  /** |z| >= threshold → anomaly. Typical: 2.0–3.0. */
  zThreshold: number;
  /** Minimum baseline samples required before scoring. */
  minSamples: number;
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = {
  windowMs: 30 * 24 * 60 * 60 * 1000,
  zThreshold: 3.0,
  minSamples: 5,
};

export class AnomalyDetectionEngine {
  /** costCenter -> chronological spend samples used as baseline. */
  private readonly _history: Map<string, SpendRecord[]>;
  private readonly _config: AnomalyConfig;
  private readonly _clock: IClock;

  constructor(config: Partial<AnomalyConfig> = {}, clock: IClock = new SystemClock()) {
    this._history = new Map();
    this._config = { ...DEFAULT_ANOMALY_CONFIG, ...config };
    this._clock = clock;
  }

  /**
   * Ingest a spend record. It is scored against the existing baseline
   * first, then appended to history — so order of ingestion matters and
   * repeated identical spikes eventually stop being anomalies.
   */
  ingest(record: SpendRecord): SpendAnomaly | null {
    const anomaly = this.score(record);
    let arr = this._history.get(record.costCenter);
    if (!arr) {
      arr = [];
      this._history.set(record.costCenter, arr);
    }
    arr.push({ ...record });
    return anomaly;
  }

  /**
   * Score a candidate record against the current baseline WITHOUT adding
   * it to history. Returns an anomaly when |z| ≥ threshold, else null.
   */
  score(record: SpendRecord): SpendAnomaly | null {
    const baseline = this._baseline(record.costCenter, record.timestamp);
    if (baseline.length < this._config.minSamples) return null;

    const mean = baseline.reduce((s, r) => s + r.amountCents, 0) / baseline.length;
    const variance =
      baseline.reduce((s, r) => s + (r.amountCents - mean) ** 2, 0) / baseline.length;
    const stddev = Math.sqrt(variance);

    if (stddev === 0) {
      // Degenerate baseline: any deviation is infinitely anomalous.
      if (record.amountCents === mean) return null;
      return {
        costCenter: record.costCenter,
        timestamp: record.timestamp,
        amountCents: record.amountCents,
        meanCents: mean,
        stddevCents: 0,
        zScore: record.amountCents > mean ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
        direction: record.amountCents > mean ? 'spike' : 'drop',
      };
    }

    const z = (record.amountCents - mean) / stddev;
    if (Math.abs(z) < this._config.zThreshold) return null;

    return {
      costCenter: record.costCenter,
      timestamp: record.timestamp,
      amountCents: record.amountCents,
      meanCents: mean,
      stddevCents: stddev,
      zScore: z,
      direction: z > 0 ? 'spike' : 'drop',
    };
  }

  /** Batch-ingest records in order; returns all detected anomalies. */
  ingestAll(records: ReadonlyArray<SpendRecord>): SpendAnomaly[] {
    const out: SpendAnomaly[] = [];
    for (const r of records) {
      const a = this.ingest(r);
      if (a) out.push(a);
    }
    return out;
  }

  /** Current baseline statistics for a cost center (for dashboards). */
  stats(costCenter: string): { meanCents: number; stddevCents: number; samples: number } | null {
    const baseline = this._baseline(costCenter, this._clock.now());
    if (baseline.length === 0) return null;
    const mean = baseline.reduce((s, r) => s + r.amountCents, 0) / baseline.length;
    const variance =
      baseline.reduce((s, r) => s + (r.amountCents - mean) ** 2, 0) / baseline.length;
    return { meanCents: mean, stddevCents: Math.sqrt(variance), samples: baseline.length };
  }

  /** Baseline samples within the window ending at `beforeTs`. */
  private _baseline(costCenter: string, beforeTs: number): SpendRecord[] {
    const arr = this._history.get(costCenter) ?? [];
    const cutoff = beforeTs - this._config.windowMs;
    return arr.filter((r) => r.timestamp < beforeTs && r.timestamp >= cutoff);
  }
}
