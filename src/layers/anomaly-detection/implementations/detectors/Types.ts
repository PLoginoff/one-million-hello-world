/**
 * Types
 *
 * Shared anomaly-detection model: a detector inspects numeric series
 * (or streams) and returns scored anomalies.
 */

export interface DataPoint {
  readonly timestamp: number;
  readonly value: number;
}

export interface Anomaly {
  /** index into the input series, or -1 for streaming detection */
  readonly index: number;
  readonly timestamp?: number;
  readonly value: number;
  /** detector-specific score; higher = more anomalous */
  readonly score: number;
  /** normalized severity in [0,1] where available */
  readonly severity: number;
  readonly detector: string;
  readonly explanation: string;
}

/** Batch detector: analyze a whole series at once. */
export interface IBatchDetector {
  readonly name: string;
  detect(series: readonly DataPoint[]): Anomaly[];
}

/** Streaming detector: update state per point, report if anomalous. */
export interface IStreamingDetector {
  readonly name: string;
  /** Returns an anomaly if the point is anomalous, else null. */
  update(point: DataPoint): Anomaly | null;
  reset(): void;
}

/** Basic statistics helpers shared across detectors. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function variance(values: readonly number[], sampleVariance = true): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return s / (values.length - (sampleVariance ? 1 : 0));
}

export function stddev(values: readonly number[], sampleVariance = true): number {
  return Math.sqrt(variance(values, sampleVariance));
}

/** Median of a numeric array (does not mutate input). */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Quantile via linear interpolation on sorted data.
 * q in [0,1].
 */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Median absolute deviation. */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}
