/**
 * DriftDetectors
 *
 * Distribution-shift detection for streaming data:
 *  - PageHinkleyTest: detects mean changes via cumulative deviation.
 *  - KolmogorovSmirnovDetector: two-sample KS test between a reference
 *    window and a sliding window.
 *  - WindowedZDetector: z-score of the current window vs baseline.
 */

import { DataPoint, Anomaly, mean, stddev } from '../detectors/Types';

export interface PageHinkleyOptions {
  /** minimum amplitude of change to detect (in units of the signal) */
  readonly delta?: number;
  /** detection threshold lambda */
  readonly lambda?: number;
  /** forgetting factor < 1 gives more weight to recent deviations */
  readonly alpha?: number;
}

/**
 * Page-Hinkley test: accumulates (x_t - mean_t - delta); when the
 * cumulative sum minus its running minimum exceeds lambda, a change
 * point is declared.
 */
export class PageHinkleyTest {
  readonly name = 'page-hinkley';
  private readonly delta: number;
  private readonly lambda: number;
  private readonly alpha: number;
  private mean = 0;
  private count = 0;
  private cumSum = 0;
  private minCumSum = 0;

  constructor(options: PageHinkleyOptions = {}) {
    this.delta = options.delta ?? 0.005;
    this.lambda = options.lambda ?? 50;
    this.alpha = options.alpha ?? 0.9999;
  }

  update(value: number): boolean {
    this.count++;
    this.mean += (value - this.mean) / this.count;
    this.cumSum = this.alpha * this.cumSum + (value - this.mean - this.delta);
    this.minCumSum = Math.min(this.minCumSum, this.cumSum);
    if (this.cumSum - this.minCumSum > this.lambda) {
      this.reset();
      return true;
    }
    return false;
  }

  reset(): void {
    this.cumSum = 0;
    this.minCumSum = 0;
  }

  /** Detect change-point indices in a series. */
  detect(series: readonly DataPoint[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    for (let i = 0; i < series.length; i++) {
      if (this.update(series[i].value)) {
        anomalies.push({
          index: i,
          timestamp: series[i].timestamp,
          value: series[i].value,
          score: this.lambda,
          severity: 0.8,
          detector: this.name,
          explanation: 'Page-Hinkley change point',
        });
      }
    }
    return anomalies;
  }
}

export interface KsOptions {
  readonly referenceSize?: number;
  readonly windowSize?: number;
  /** D-statistic threshold */
  readonly threshold?: number;
}

/** Two-sample Kolmogorov-Smirnov statistic. */
export function ksStatistic(a: readonly number[], b: readonly number[]): number {
  const as = [...a].sort((x, y) => x - y);
  const bs = [...b].sort((x, y) => x - y);
  const n1 = as.length;
  const n2 = bs.length;
  if (n1 === 0 || n2 === 0) return 0;
  let i = 0;
  let j = 0;
  let d = 0;
  for (;;) {
    // next distinct value
    if (i >= n1 && j >= n2) break;
    let v: number;
    if (i < n1 && j < n2) v = Math.min(as[i], bs[j]);
    else if (i < n1) v = as[i];
    else v = bs[j];
    while (i < n1 && as[i] <= v) i++;
    while (j < n2 && bs[j] <= v) j++;
    d = Math.max(d, Math.abs(i / n1 - j / n2));
  }
  return d;
}

/**
 * Sliding two-sample KS test: compares the most recent `windowSize`
 * values to the preceding `referenceSize` values.
 */
export class KolmogorovSmirnovDetector {
  readonly name = 'ks-test';
  private readonly referenceSize: number;
  private readonly windowSize: number;
  private readonly threshold: number;

  constructor(options: KsOptions = {}) {
    this.referenceSize = options.referenceSize ?? 50;
    this.windowSize = options.windowSize ?? 20;
    this.threshold = options.threshold ?? 0.3;
  }

  detect(series: readonly DataPoint[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const need = this.referenceSize + this.windowSize;
    for (let i = need; i < series.length; i++) {
      const ref = series.slice(i - need, i - this.windowSize).map((p) => p.value);
      const cur = series.slice(i - this.windowSize, i).map((p) => p.value);
      const d = ksStatistic(ref, cur);
      if (d > this.threshold) {
        anomalies.push({
          index: i,
          timestamp: series[i].timestamp,
          value: series[i].value,
          score: d,
          severity: Math.min(1, d),
          detector: this.name,
          explanation: `KS D=${d.toFixed(3)} > ${this.threshold}`,
        });
      }
    }
    return anomalies;
  }
}

export interface ArimaOptions {
  readonly arOrder?: number;
  readonly threshold?: number;
}

/**
 * ARIMA-lite: fits an AR(p) model by least squares on the differenced
 * series, then flags points whose one-step forecast residual exceeds
 * threshold * residual stddev.
 */
export class ArAnomalyDetector {
  readonly name = 'ar-residual';
  private readonly p: number;
  private readonly threshold: number;

  constructor(options: ArimaOptions = {}) {
    this.p = options.arOrder ?? 3;
    this.threshold = options.threshold ?? 3;
  }

  /** Fit AR(p) coefficients via ordinary least squares (normal equations). */
  fitAr(series: readonly number[]): number[] {
    const p = this.p;
    const n = series.length - p;
    if (n <= p) return new Array<number>(p).fill(0);
    // normal equations: (X^T X) c = X^T y
    const xtx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const xty = new Array<number>(p).fill(0);
    for (let t = p; t < series.length; t++) {
      const row = series.slice(t - p, t).reverse();
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
          xtx[i][j] += row[i] * row[j];
        }
        xty[i] += row[i] * series[t];
      }
    }
    for (let i = 0; i < p; i++) xtx[i][i] += 1e-6;
    return solveSmall(xtx, xty);
  }

  detect(series: readonly DataPoint[]): Anomaly[] {
    const values = series.map((p) => p.value);
    const coeffs = this.fitAr(values);
    const residuals: number[] = [];
    for (let t = this.p; t < values.length; t++) {
      let pred = 0;
      for (let i = 0; i < this.p; i++) {
        pred += coeffs[i] * values[t - 1 - i];
      }
      residuals.push(values[t] - pred);
    }
    if (residuals.length < 3) return [];
    const m = mean(residuals);
    const s = stddev(residuals);
    if (s === 0) return [];
    const anomalies: Anomaly[] = [];
    for (let i = 0; i < residuals.length; i++) {
      const z = Math.abs(residuals[i] - m) / s;
      if (z > this.threshold) {
        anomalies.push({
          index: i + this.p,
          timestamp: series[i + this.p].timestamp,
          value: values[i + this.p],
          score: z,
          severity: Math.min(1, z / (this.threshold * 2)),
          detector: this.name,
          explanation: `AR(${this.p}) residual z=${z.toFixed(2)}`,
        });
      }
    }
    return anomalies;
  }
}

function solveSmall(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    }
    [M[c], M[pivot]] = [M[pivot], M[c]];
    const d = Math.abs(M[c][c]) < 1e-12 ? 1e-10 : M[c][c];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / (Math.abs(M[i][i]) < 1e-12 ? 1e-10 : M[i][i]));
}
