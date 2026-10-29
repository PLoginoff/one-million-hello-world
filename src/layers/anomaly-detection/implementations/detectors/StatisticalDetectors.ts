/**
 * StatisticalDetectors
 *
 * Univariate outlier detectors: Z-score, modified Z-score (MAD), and IQR.
 */

import {
  IBatchDetector,
  IStreamingDetector,
  DataPoint,
  Anomaly,
  mean,
  stddev,
  median,
  mad,
  quantile,
} from './Types';

export interface ZScoreOptions {
  /** |z| above this is anomalous; typical 3 */
  readonly threshold?: number;
  /** use median/MAD instead of mean/std (robust variant) */
  readonly robust?: boolean;
}

export class ZScoreDetector implements IBatchDetector {
  readonly name = 'z-score';
  private readonly threshold: number;
  private readonly robust: boolean;

  constructor(options: ZScoreOptions = {}) {
    this.threshold = options.threshold ?? 3;
    this.robust = options.robust ?? false;
  }

  detect(series: readonly DataPoint[]): Anomaly[] {
    const values = series.map((p) => p.value);
    if (values.length < 3) return [];
    let center: number;
    let scale: number;
    if (this.robust) {
      center = median(values);
      // 0.6745 scales MAD to be consistent with stddev under normality
      scale = mad(values) / 0.6745;
    } else {
      center = mean(values);
      scale = stddev(values);
    }
    if (scale === 0) return [];
    const anomalies: Anomaly[] = [];
    for (let i = 0; i < series.length; i++) {
      const z = Math.abs(series[i].value - center) / scale;
      if (z > this.threshold) {
        anomalies.push({
          index: i,
          timestamp: series[i].timestamp,
          value: series[i].value,
          score: z,
          severity: Math.min(1, z / (this.threshold * 2)),
          detector: this.name,
          explanation: `|z|=${z.toFixed(2)} exceeds threshold ${this.threshold} (center=${center.toFixed(2)}, scale=${scale.toFixed(2)})`,
        });
      }
    }
    return anomalies;
  }
}

export interface IqrOptions {
  /** fence multiplier; 1.5 = outliers, 3 = extreme outliers */
  readonly multiplier?: number;
}

export class IqrDetector implements IBatchDetector {
  readonly name = 'iqr';
  private readonly multiplier: number;

  constructor(options: IqrOptions = {}) {
    this.multiplier = options.multiplier ?? 1.5;
  }

  detect(series: readonly DataPoint[]): Anomaly[] {
    const values = series.map((p) => p.value);
    if (values.length < 4) return [];
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const iqr = q3 - q1;
    if (iqr === 0) return [];
    const lower = q1 - this.multiplier * iqr;
    const upper = q3 + this.multiplier * iqr;
    const anomalies: Anomaly[] = [];
    for (let i = 0; i < series.length; i++) {
      const v = series[i].value;
      if (v < lower || v > upper) {
        const distance = v < lower ? lower - v : v - upper;
        const score = distance / iqr;
        anomalies.push({
          index: i,
          timestamp: series[i].timestamp,
          value: v,
          score,
          severity: Math.min(1, score / 3),
          detector: this.name,
          explanation: `value ${v.toFixed(2)} outside [${lower.toFixed(2)}, ${upper.toFixed(2)}] (IQR=${iqr.toFixed(2)})`,
        });
      }
    }
    return anomalies;
  }
}

export interface GrubbsOptions {
  /** significance level; smaller = stricter */
  readonly alpha?: number;
}

/**
 * Grubbs' test for a single outlier (iteratively applied for multiple).
 * Uses a lookup approximation of the critical value for common n.
 */
export class GrubbsDetector implements IBatchDetector {
  readonly name = 'grubbs';
  private readonly alpha: number;
  private readonly maxOutliers: number;

  constructor(options: GrubbsOptions & { maxOutliers?: number } = {}) {
    this.alpha = options.alpha ?? 0.05;
    this.maxOutliers = options.maxOutliers ?? 5;
  }

  detect(series: readonly DataPoint[]): Anomaly[] {
    const values = series.map((p) => p.value);
    const anomalies: Anomaly[] = [];
    if (values.length < 3) return anomalies;
    // work on a mutable copy with original indices
    const remaining = values.map((v, i) => ({ v, i }));
    for (let iter = 0; iter < this.maxOutliers && remaining.length >= 3; iter++) {
      const vals = remaining.map((r) => r.v);
      const m = mean(vals);
      const s = stddev(vals);
      if (s === 0) break;
      // find max deviation
      let maxIdx = 0;
      let maxG = 0;
      for (let i = 0; i < vals.length; i++) {
        const g = Math.abs(vals[i] - m) / s;
        if (g > maxG) {
          maxG = g;
          maxIdx = i;
        }
      }
      const n = vals.length;
      // Grubbs critical value approximation (two-sided)
      // G_crit = (n-1)/sqrt(n) * sqrt(t^2 / (n-2+t^2)); approximate t via
      // a conservative bound. For simplicity, use the common rule of thumb:
      const tCrit = this.approxTCritical(n);
      const gCrit = ((n - 1) / Math.sqrt(n)) * Math.sqrt((tCrit * tCrit) / (n - 2 + tCrit * tCrit));
      if (maxG <= gCrit) break;
      const out = remaining.splice(maxIdx, 1)[0];
      anomalies.push({
        index: out.i,
        timestamp: series[out.i].timestamp,
        value: out.v,
        score: maxG,
        severity: Math.min(1, maxG / (gCrit * 2)),
        detector: this.name,
        explanation: `Grubbs G=${maxG.toFixed(2)} > critical ${gCrit.toFixed(2)} (n=${n})`,
      });
    }
    return anomalies;
  }

  /** Rough t-distribution critical value at alpha/(2n) for df=n-2. */
  private approxTCritical(n: number): number {
    // alpha adjusted per Bonferroni; use a small lookup + asymptotic fallback
    const df = n - 2;
    if (df <= 0) return Infinity;
    // approximation: t ~ z for large df; use z for alpha/(2n)
    const p = 1 - this.alpha / (2 * n);
    // inverse normal via rational approximation (Acklam)
    const z = inverseNormalCdf(p);
    // Cornish-Fisher expansion to approximate t from z
    return (
      z +
      (z * z * z + z) / (4 * df) +
      (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df)
    );
  }
}

/** Inverse standard normal CDF (Acklam's algorithm). */
export function inverseNormalCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (phigh < p) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}
