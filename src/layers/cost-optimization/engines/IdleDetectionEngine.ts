/**
 * Idle Resource Detection Engine
 *
 * Ingests utilization samples per (resource, metric) and flags resources
 * whose utilization percentile over a sliding window sits below a
 * threshold — the classic "zombie resource" FinOps signal.
 *
 * Percentile algorithm: nearest-rank on a sorted copy of the windowed
 * samples — p95 of [s1..sn] is the value at rank ceil(0.95·n). Sorting is
 * O(n log n) per evaluation; samples outside the window are pruned on
 * read, so memory stays bounded by window length × sample rate.
 *
 * @module CostOptimizationLayer/Engines
 */

import { IClock, IdleReport, SystemClock, UtilizationSample } from './types';
import type { CostInventoryEngine } from './CostInventoryEngine';

export interface IdleDetectionConfig {
  /** Look-back window in ms; older samples are ignored. */
  windowMs: number;
  /** Percentile to evaluate, 1–99 (typically 95). */
  percentile: number;
  /** Utilization percent below which a resource counts as idle. */
  idleThresholdPercent: number;
  /** Minimum samples required before a verdict is emitted. */
  minSamples: number;
}

export const DEFAULT_IDLE_CONFIG: IdleDetectionConfig = {
  windowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  percentile: 95,
  idleThresholdPercent: 5,
  minSamples: 10,
};

export class IdleDetectionEngine {
  /** key = `${resourceId}${metric}` -> timestamp-ordered samples */
  private readonly _samples: Map<string, UtilizationSample[]>;
  private readonly _config: IdleDetectionConfig;
  private readonly _inventory: CostInventoryEngine | null;
  private readonly _clock: IClock;

  constructor(
    config: Partial<IdleDetectionConfig> = {},
    inventory: CostInventoryEngine | null = null,
    clock: IClock = new SystemClock()
  ) {
    this._samples = new Map();
    this._config = { ...DEFAULT_IDLE_CONFIG, ...config };
    this._inventory = inventory;
    this._clock = clock;
  }

  /** Record a utilization sample. Samples may arrive out of order. */
  record(sample: UtilizationSample): void {
    if (sample.percent < 0 || sample.percent > 100) {
      throw new Error(`Invalid utilization percent: ${sample.percent}`);
    }
    const key = this._key(sample.resourceId, sample.metric);
    let arr = this._samples.get(key);
    if (!arr) {
      arr = [];
      this._samples.set(key, arr);
    }
    // Insert keeping timestamp order — usually appends, bisect on reorder.
    if (arr.length === 0 || arr[arr.length - 1]!.timestamp <= sample.timestamp) {
      arr.push(sample);
    } else {
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid]!.timestamp <= sample.timestamp) lo = mid + 1;
        else hi = mid;
      }
      arr.splice(lo, 0, sample);
    }
  }

  /**
   * Nearest-rank percentile of a sorted numeric array.
   * p95 of n samples = value at index ceil(0.95·n) - 1.
   */
  static percentile(sorted: ReadonlyArray<number>, p: number): number {
    if (sorted.length === 0) return 0;
    const rank = Math.ceil((p / 100) * sorted.length);
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
  }

  /** Evaluate one (resource, metric) pair. Null when too few samples. */
  evaluate(resourceId: string, metric: string): IdleReport | null {
    const windowed = this._windowSamples(resourceId, metric);
    if (windowed.length < this._config.minSamples) return null;

    const values = windowed.map((s) => s.percent).sort((a, b) => a - b);
    const pValue = IdleDetectionEngine.percentile(values, this._config.percentile);
    const idle = pValue < this._config.idleThresholdPercent;

    let hourlyWasteCents = 0;
    if (idle && this._inventory) {
      const resource = this._inventory.getResource(resourceId);
      if (resource) hourlyWasteCents = resource.hourlyCostCents;
    }

    return {
      resourceId,
      metric,
      percentileValue: pValue,
      percentile: this._config.percentile,
      sampleCount: windowed.length,
      idle,
      hourlyWasteCents,
    };
  }

  /**
   * Evaluate every (resource, metric) pair that has enough data.
   * Results sorted by waste descending.
   */
  scan(): IdleReport[] {
    const reports: IdleReport[] = [];
    for (const key of this._samples.keys()) {
      const sep = key.indexOf('::');
      const resourceId = key.slice(0, sep);
      const metric = key.slice(sep + 2);
      const report = this.evaluate(resourceId, metric);
      if (report) reports.push(report);
    }
    return reports.sort((a, b) => b.hourlyWasteCents - a.hourlyWasteCents);
  }

  /** Only the idle reports — the actionable zombie list. */
  idleResources(): IdleReport[] {
    return this.scan().filter((r) => r.idle);
  }

  /** Drop samples older than the window; returns pruned count. */
  prune(): number {
    const cutoff = this._clock.now() - this._config.windowMs;
    let pruned = 0;
    for (const [key, arr] of this._samples) {
      const keep = arr.filter((s) => s.timestamp >= cutoff);
      pruned += arr.length - keep.length;
      if (keep.length === 0) this._samples.delete(key);
      else this._samples.set(key, keep);
    }
    return pruned;
  }

  private _windowSamples(resourceId: string, metric: string): UtilizationSample[] {
    const arr = this._samples.get(this._key(resourceId, metric));
    if (!arr) return [];
    const cutoff = this._clock.now() - this._config.windowMs;
    return arr.filter((s) => s.timestamp >= cutoff);
  }

  private _key(resourceId: string, metric: string): string {
    return `${resourceId}::${metric}`;
  }
}
