/**
 * Anomaly Root-Cause Analysis
 *
 * The existing AnomalyDetectionEngine flags *that* spend spiked for a
 * cost center. This engine answers the follow-up question every on-call
 * FinOps engineer asks next: *which tag/dimension changed?*
 *
 * Approach — counterfactual decomposition:
 *
 * For each tagged dimension (service, region, instance-family, team, …)
 * we compare the anomaly window's spend against the baseline window's
 * spend, decomposed by tag value:
 *
 *   Δ(tagValue) = spend_anomaly(tagValue) − expected(tagValue)
 *
 * where expected(tagValue) is the value's baseline spend scaled by the
 * overall spend ratio between windows — values that merely grew with
 * the crowd are *not* root causes. The residual "above-expected" mass
 * is attributed to the offending values.
 *
 * A value is a candidate root cause when:
 *   1. Its absolute Δ is large (above `minDeltaShare` of the total Δ), and
 *   2. Its growth ratio exceeds the overall growth ratio by a margin
 *      (`minRatioExcess`), i.e. it grew *faster* than the average.
 *
 * The output ranks candidates by their share of the *unexplained* delta
 * — the same "driver analysis" view real tools (CloudZero, Vantage)
 * render when you click into a spike.
 *
 * Complexity: O(#records × #tagKeys) for ingestion; O(#tagValues) per
 * explain call.
 *
 * @module CostOptimization/Engine2
 */

import { IClock, SystemClock } from '../engines/types';

/** A tagged spend line-item (e.g. one CUR record). */
export interface TaggedSpendRecord {
  readonly timestamp: number;
  /** Cost center grouping (same granularity the detector uses). */
  readonly costCenter: string;
  readonly amountCents: number;
  /** Arbitrary dimensions — 'service', 'region', 'instance-family', 'team'. */
  readonly tags: Readonly<Record<string, string>>;
}

/** One suspected driver of the anomaly. */
export interface RootCauseCandidate {
  /** Tag key, e.g. 'service'. */
  readonly dimension: string;
  /** Tag value, e.g. 'data-pipeline'. */
  readonly value: string;
  /** Baseline spend for this value (baseline window). */
  readonly baselineCents: number;
  /** Anomaly-window spend for this value. */
  readonly anomalyCents: number;
  /** What spend would have been if this value grew at the crowd rate. */
  readonly expectedCents: number;
  /** Above-expected delta — the share of the spike this value explains. */
  readonly excessDeltaCents: number;
  /** excessDelta / totalExcessDelta across all candidates, 0..1. */
  readonly contributionShare: number;
  /** anomaly/baseline growth ratio (Infinity when baseline = 0). */
  readonly growthRatio: number;
}

/** Report for one anomaly. */
export interface RootCauseReport {
  readonly costCenter: string;
  readonly baselineWindowMs: number;
  readonly anomalyWindowMs: number;
  /** Total spend in each window. */
  readonly baselineTotalCents: number;
  readonly anomalyTotalCents: number;
  /** Overall growth ratio (anomaly/baseline). */
  readonly totalGrowthRatio: number;
  /** Ranked drivers — the values most responsible for the excess. */
  readonly candidates: readonly RootCauseCandidate[];
  /** Delta not attributable to any single tag value (long tail). */
  readonly unattributedCents: number;
  readonly summary: string;
}

/** Root-cause tuning. */
export interface RootCauseConfig {
  /** Tag keys to decompose on. Default: all keys present. */
  readonly dimensions: readonly string[] | null;
  /**
   * Minimum share of the total excess delta a value must explain to be
   * listed as a candidate. Default 0.1 (10%).
   */
  readonly minDeltaShare: number;
  /**
   * Minimum ratio by which a candidate's growth must exceed the total
   * growth to count (e.g. 1.2 = grew 20% faster than the crowd).
   * Default 1.1.
   */
  readonly minRatioExcess: number;
  /** Max candidates returned per report. Default 10. */
  readonly maxCandidates: number;
}

export const DEFAULT_ROOT_CAUSE_CONFIG: RootCauseConfig = {
  dimensions: null,
  minDeltaShare: 0.1,
  minRatioExcess: 1.1,
  maxCandidates: 10,
};

/**
 * AnomalyRootCause — tag-level decomposition of spend spikes.
 */
export class AnomalyRootCause {
  private readonly _records: TaggedSpendRecord[] = [];
  private readonly _config: RootCauseConfig;
  private readonly _clock: IClock;

  constructor(config: Partial<RootCauseConfig> = {}, clock: IClock = new SystemClock()) {
    this._config = { ...DEFAULT_ROOT_CAUSE_CONFIG, ...config };
    this._clock = clock;
  }

  /** Ingest a tagged spend record. */
  ingest(record: TaggedSpendRecord): void {
    if (record.amountCents < 0) {
      throw new Error(`negative spend for ${record.costCenter}`);
    }
    this._records.push({ ...record, tags: { ...record.tags } });
  }

  /** Bulk ingest. */
  ingestAll(records: readonly TaggedSpendRecord[]): void {
    for (const r of records) this.ingest(r);
  }

  /**
   * Explain an anomaly detected at `anomalyAt` for `costCenter`.
   *
   * `anomalyWindowMs` is the width of the anomalous period (e.g. 1 day);
   * the baseline is the `baselineWindowMs` ending at `anomalyAt`, and its
   * spend is rescaled to a per-day rate for comparability.
   */
  explain(
    costCenter: string,
    anomalyAt: number,
    anomalyWindowMs: number,
    baselineWindowMs: number
  ): RootCauseReport {
    const anomalyStart = anomalyAt;
    const anomalyEnd = anomalyAt + anomalyWindowMs;
    const baselineStart = anomalyAt - baselineWindowMs;

    const inWindow = (t: number, lo: number, hi: number) => t >= lo && t < hi;
    const center = this._records.filter((r) => r.costCenter === costCenter);
    const baseline = center.filter((r) => inWindow(r.timestamp, baselineStart, anomalyStart));
    const anomaly = center.filter((r) => inWindow(r.timestamp, anomalyStart, anomalyEnd));

    const baselineTotal = baseline.reduce((a, r) => a + r.amountCents, 0);
    const anomalyTotal = anomaly.reduce((a, r) => a + r.amountCents, 0);
    // Normalise baseline to the anomaly window's duration — a 30-day
    // baseline vs a 1-day anomaly compares daily rates.
    const baselineRate = baselineTotal / baselineWindowMs;
    const anomalyRate = anomalyTotal / anomalyWindowMs;
    const totalGrowth = baselineRate === 0 ? Number.POSITIVE_INFINITY : anomalyRate / baselineRate;

    // Enumerate tag keys.
    const dims = this._config.dimensions ?? this._allTagKeys(baseline, anomaly);
    const candidates: RootCauseCandidate[] = [];
    let totalExcess = 0;

    for (const dim of dims) {
      // Per-value spend in each window.
      const baseByVal = new Map<string, number>();
      const anomByVal = new Map<string, number>();
      for (const r of baseline) {
        const v = r.tags[dim] ?? '(untagged)';
        baseByVal.set(v, (baseByVal.get(v) ?? 0) + r.amountCents);
      }
      for (const r of anomaly) {
        const v = r.tags[dim] ?? '(untagged)';
        anomByVal.set(v, (anomByVal.get(v) ?? 0) + r.amountCents);
      }
      const allVals = new Set([...baseByVal.keys(), ...anomByVal.keys()]);
      for (const v of allVals) {
        const bCents = baseByVal.get(v) ?? 0;
        const aCents = anomByVal.get(v) ?? 0;
        const bRate = bCents / baselineWindowMs;
        const aRate = aCents / anomalyWindowMs;
        // Expected: this value grows at the crowd rate.
        const expected = Number.isFinite(totalGrowth) ? bRate * totalGrowth * anomalyWindowMs : 0;
        const excess = aCents - expected;
        if (excess <= 0) continue;
        const growth = bRate === 0 ? (aRate > 0 ? Number.POSITIVE_INFINITY : 1) : aRate / bRate;
        // Growth must exceed the crowd by the configured margin.
        if (
          Number.isFinite(growth) &&
          Number.isFinite(totalGrowth) &&
          growth < totalGrowth * this._config.minRatioExcess
        ) {
          continue;
        }
        candidates.push({
          dimension: dim,
          value: v,
          baselineCents: bCents,
          anomalyCents: aCents,
          expectedCents: expected,
          excessDeltaCents: excess,
          contributionShare: 0, // filled after totalExcess known
          growthRatio: growth,
        });
        totalExcess += excess;
      }
    }

    // Filter by min share of total excess and compute shares.
    const filtered = candidates.filter((c) => c.excessDeltaCents >= totalExcess * this._config.minDeltaShare);
    filtered.sort((a, b) => b.excessDeltaCents - a.excessDeltaCents);
    const kept = filtered.slice(0, this._config.maxCandidates).map((c) => ({
      ...c,
      contributionShare: totalExcess === 0 ? 0 : c.excessDeltaCents / totalExcess,
    }));
    const keptDelta = kept.reduce((a, c) => a + c.excessDeltaCents, 0);
    const rawDelta = anomalyTotal - baselineRate * anomalyWindowMs;
    const unattributed = Math.max(0, rawDelta - keptDelta);

    const summary =
      kept.length === 0
        ? `no dominant driver — ${keptDelta.toFixed(0)}c of ${rawDelta.toFixed(0)}c attributed, ` +
          `spread across the long tail`
        : kept
            .slice(0, 3)
            .map(
              (c) =>
                `${c.dimension}=${c.value} (+${c.excessDeltaCents.toFixed(0)}c, ` +
                `${(c.contributionShare * 100).toFixed(0)}%)`
            )
            .join('; ');

    void this._clock; // clock reserved for future freshness checks
    return {
      costCenter,
      baselineWindowMs,
      anomalyWindowMs,
      baselineTotalCents: baselineTotal,
      anomalyTotalCents: anomalyTotal,
      totalGrowthRatio: totalGrowth,
      candidates: kept,
      unattributedCents: unattributed,
      summary,
    };
  }

  private _allTagKeys(a: readonly TaggedSpendRecord[], b: readonly TaggedSpendRecord[]): string[] {
    const keys = new Set<string>();
    for (const r of a) for (const k of Object.keys(r.tags)) keys.add(k);
    for (const r of b) for (const k of Object.keys(r.tags)) keys.add(k);
    return [...keys];
  }
}
