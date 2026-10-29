/**
 * Seasonal
 *
 * Classical additive seasonal decomposition (trend via centered moving
 * average, seasonality via period means, residual = observed - trend -
 * seasonal) and a seasonal-aware detector that flags large residuals.
 */

import { IBatchDetector, DataPoint, Anomaly, mean, stddev, median, mad } from './Types';

export interface Decomposition {
  readonly trend: readonly (number | null)[];
  readonly seasonal: readonly number[];
  readonly residual: readonly (number | null)[];
}

/**
 * Additive seasonal decomposition with period `period`.
 * Trend = centered moving average; seasonal = mean detrended value per
 * season index (adjusted to sum to 0); residual = remainder.
 */
export function seasonalDecompose(
  series: readonly DataPoint[],
  period: number
): Decomposition {
  const n = series.length;
  const values = series.map((p) => p.value);
  const trend: (number | null)[] = new Array<number | null>(n).fill(null);
  // centered moving average
  const half = Math.floor(period / 2);
  for (let i = 0; i < n; i++) {
    if (period % 2 === 1) {
      // odd period: simple window
      const start = i - half;
      const end = i + half;
      if (start < 0 || end >= n) continue;
      let sum = 0;
      for (let j = start; j <= end; j++) sum += values[j];
      trend[i] = sum / period;
    } else {
      // even period: average of two shifted windows
      const s1 = i - half;
      const e1 = i + half - 1;
      const s2 = i - half + 1;
      const e2 = i + half;
      if (s1 < 0 || e2 >= n) continue;
      let a = 0;
      let b = 0;
      for (let j = s1; j <= e1; j++) a += values[j];
      for (let j = s2; j <= e2; j++) b += values[j];
      trend[i] = (a / period + b / period) / 2;
    }
  }
  // detrended values grouped by season index
  const seasonBuckets: number[][] = Array.from({ length: period }, () => []);
  for (let i = 0; i < n; i++) {
    const t = trend[i];
    if (t !== null) {
      seasonBuckets[i % period].push(values[i] - t);
    }
  }
  const seasonalRaw = seasonBuckets.map((b) => (b.length > 0 ? mean(b) : 0));
  const seasonalMean = mean(seasonalRaw);
  const seasonalAdjusted = seasonalRaw.map((s) => s - seasonalMean);
  const seasonal: number[] = new Array<number>(n);
  const residual: (number | null)[] = new Array<number | null>(n).fill(null);
  for (let i = 0; i < n; i++) {
    seasonal[i] = seasonalAdjusted[i % period];
    const t = trend[i];
    if (t !== null) {
      residual[i] = values[i] - t - seasonal[i];
    }
  }
  return { trend, seasonal, residual };
}

export interface SeasonalDetectorOptions {
  readonly period: number;
  /** z-threshold on residual (robust: uses median + MAD) */
  readonly threshold?: number;
}

/** Detect anomalies as large deviations from the seasonal+trend model. */
export class SeasonalDetector implements IBatchDetector {
  readonly name = 'seasonal-residual';
  private readonly period: number;
  private readonly threshold: number;

  constructor(options: SeasonalDetectorOptions) {
    this.period = options.period;
    this.threshold = options.threshold ?? 3.5;
  }

  detect(series: readonly DataPoint[]): Anomaly[] {
    const { residual } = seasonalDecompose(series, this.period);
    const valid = residual.filter((r): r is number => r !== null);
    if (valid.length < 4) return [];
    const center = median(valid);
    const scale = mad(valid) / 0.6745;
    const anomalies: Anomaly[] = [];
    for (let i = 0; i < residual.length; i++) {
      const r = residual[i];
      if (r === null || scale === 0) continue;
      const z = Math.abs(r - center) / scale;
      if (z > this.threshold) {
        anomalies.push({
          index: i,
          timestamp: series[i].timestamp,
          value: series[i].value,
          score: z,
          severity: Math.min(1, z / (this.threshold * 2)),
          detector: this.name,
          explanation: `seasonal residual z=${z.toFixed(2)} > ${this.threshold}`,
        });
      }
    }
    return anomalies;
  }
}

export interface StlLikeOptions {
  readonly period: number;
  /** z-threshold on residual */
  readonly threshold?: number;
}

/**
 * Simplified STL alternative: robust seasonal decomposition using median
 * per season bucket, then flags residual outliers. Cheaper than full STL
 * but resistant to anomaly contamination of the seasonal profile.
 */
export class RobustSeasonalDetector implements IBatchDetector {
  readonly name = 'robust-seasonal';
  private readonly period: number;
  private readonly threshold: number;

  constructor(options: StlLikeOptions) {
    this.period = options.period;
    this.threshold = options.threshold ?? 3.5;
  }

  detect(series: readonly DataPoint[]): Anomaly[] {
    const n = series.length;
    const values = series.map((p) => p.value);
    if (n < this.period * 2) return [];
    // trend via median filter
    const half = Math.floor(this.period / 2);
    const trend: (number | null)[] = new Array<number | null>(n).fill(null);
    for (let i = 0; i < n; i++) {
      const s = Math.max(0, i - half);
      const e = Math.min(n - 1, i + half);
      trend[i] = median(values.slice(s, e + 1));
    }
    // robust season index profiles
    const buckets: number[][] = Array.from({ length: this.period }, () => []);
    for (let i = 0; i < n; i++) {
      const t = trend[i];
      if (t !== null) buckets[i % this.period].push(values[i] - t);
    }
    const profile = buckets.map((b) => (b.length > 0 ? median(b) : 0));
    const profMean = mean(profile);
    const residuals: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = trend[i];
      if (t !== null) {
        residuals.push(values[i] - t - (profile[i % this.period] - profMean));
      }
    }
    if (residuals.length < 4) return [];
    const rMean = mean(residuals);
    const rStd = stddev(residuals);
    if (rStd === 0) return [];
    const anomalies: Anomaly[] = [];
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (trend[i] === null) continue;
      const r = residuals[k++];
      const z = Math.abs(r - rMean) / rStd;
      if (z > this.threshold) {
        anomalies.push({
          index: i,
          timestamp: series[i].timestamp,
          value: series[i].value,
          score: z,
          severity: Math.min(1, z / (this.threshold * 2)),
          detector: this.name,
          explanation: `robust seasonal residual z=${z.toFixed(2)}`,
        });
      }
    }
    return anomalies;
  }
}
