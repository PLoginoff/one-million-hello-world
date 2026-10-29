/**
 * Gaussian
 *
 * Multivariate Gaussian anomaly detection via Mahalanobis distance.
 * Estimates mean vector and covariance matrix, inverts the covariance
 * (with diagonal regularization), and scores points by squared
 * Mahalanobis distance, which follows a chi-squared distribution under
 * normality.
 */

import { FeatureVector } from '../detectors/IsolationForest';

export interface GaussianModel {
  readonly mean: readonly number[];
  readonly inverseCovariance: readonly number[][];
  readonly dims: number;
  readonly regularization: number;
}

/** Fit mean + regularized inverse covariance of the samples. */
export function fitGaussian(
  samples: readonly FeatureVector[],
  regularization = 1e-6
): GaussianModel {
  const n = samples.length;
  if (n === 0) throw new Error('no samples');
  const dims = samples[0].length;
  const mean = new Array<number>(dims).fill(0);
  for (const s of samples) {
    for (let i = 0; i < dims; i++) mean[i] += s[i];
  }
  for (let i = 0; i < dims; i++) mean[i] /= n;
  const cov = Array.from({ length: dims }, () => new Array<number>(dims).fill(0));
  for (const s of samples) {
    for (let i = 0; i < dims; i++) {
      for (let j = 0; j < dims; j++) {
        cov[i][j] += (s[i] - mean[i]) * (s[j] - mean[j]);
      }
    }
  }
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < dims; i++) {
    for (let j = 0; j < dims; j++) cov[i][j] /= denom;
    cov[i][i] += regularization;
  }
  const inv = invertMatrix(cov);
  return { mean, inverseCovariance: inv, dims, regularization };
}

/** Squared Mahalanobis distance (x-μ)ᵀ Σ⁻¹ (x-μ). */
export function mahalanobisSquared(model: GaussianModel, x: FeatureVector): number {
  const d = x.map((v, i) => v - (model.mean[i] ?? 0));
  let sum = 0;
  for (let i = 0; i < model.dims; i++) {
    for (let j = 0; j < model.dims; j++) {
      sum += d[i] * model.inverseCovariance[i][j] * d[j];
    }
  }
  return sum;
}

/** Chi-squared survival function approximation for df up to ~10 (Wilson-Hilferty). */
export function chiSquaredPValue(x: number, df: number): number {
  if (x <= 0) return 1;
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const sd = Math.sqrt(2 / (9 * df));
  const zscore = z / sd;
  return 1 - normalCdf(zscore);
}

export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** Error function approximation (Abramowitz & Stegun 7.1.26). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Invert a symmetric positive-definite matrix via Gauss-Jordan. */
export function invertMatrix(m: readonly (readonly number[])[]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => {
    const r = new Array<number>(2 * n).fill(0);
    for (let j = 0; j < n; j++) r[j] = row[j];
    r[n + i] = 1;
    return r;
  });
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const d = a[col][col];
    if (Math.abs(d) < 1e-15) {
      a[col][col] = 1e-10;
    }
    const piv = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

export interface MahalanobisDetectorOptions {
  readonly regularization?: number;
  /** flag when p-value < alpha (chi-squared test) */
  readonly alpha?: number;
}

export class MahalanobisDetector {
  readonly name = 'mahalanobis';
  private model: GaussianModel | null = null;
  private readonly regularization: number;
  private readonly alpha: number;

  constructor(options: MahalanobisDetectorOptions = {}) {
    this.regularization = options.regularization ?? 1e-4;
    this.alpha = options.alpha ?? 0.01;
  }

  fit(samples: readonly FeatureVector[]): void {
    this.model = fitGaussian(samples, this.regularization);
  }

  /** Squared Mahalanobis distance; undefined if not fitted. */
  score(x: FeatureVector): number {
    if (this.model === null) throw new Error('not fitted');
    return mahalanobisSquared(this.model, x);
  }

  /** p-value under chi-squared(df=dims). Smaller = more anomalous. */
  pValue(x: FeatureVector): number {
    if (this.model === null) throw new Error('not fitted');
    return chiSquaredPValue(this.score(x), this.model.dims);
  }

  isAnomaly(x: FeatureVector): boolean {
    return this.pValue(x) < this.alpha;
  }
}
