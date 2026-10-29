/**
 * Dbscan
 *
 * Density-based spatial clustering (DBSCAN). Points that can't be
 * assigned to any cluster (label = -1) are noise — i.e. anomalies.
 */

import { FeatureVector } from '../detectors/IsolationForest';

export type DistanceFn = (a: FeatureVector, b: FeatureVector) => number;

export function euclideanDistance(a: FeatureVector, b: FeatureVector): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

export function manhattanDistance(a: FeatureVector, b: FeatureVector): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s;
}

export interface DbscanResult {
  /** cluster label per sample; -1 = noise/anomaly */
  readonly labels: readonly number[];
  readonly clusterCount: number;
  readonly noiseIndices: readonly number[];
}

export class Dbscan {
  private readonly eps: number;
  private readonly minPts: number;
  private readonly distance: DistanceFn;

  constructor(eps: number, minPts = 5, distance: DistanceFn = euclideanDistance) {
    this.eps = eps;
    this.minPts = minPts;
    this.distance = distance;
  }

  fit(samples: readonly FeatureVector[]): DbscanResult {
    const n = samples.length;
    const labels = new Array<number>(n).fill(-2); // -2 = unvisited
    const distMatrix = this.computeDistances(samples);
    let clusterId = 0;
    for (let i = 0; i < n; i++) {
      if (labels[i] !== -2) continue;
      const neighbors = this.regionQuery(distMatrix, i);
      if (neighbors.length < this.minPts) {
        labels[i] = -1; // noise
        continue;
      }
      // expand cluster
      labels[i] = clusterId;
      const queue = [...neighbors];
      while (queue.length > 0) {
        const j = queue.shift()!;
        if (labels[j] === -1) labels[j] = clusterId; // noise -> border
        if (labels[j] !== -2) continue;
        labels[j] = clusterId;
        const jNeighbors = this.regionQuery(distMatrix, j);
        if (jNeighbors.length >= this.minPts) {
          for (const k of jNeighbors) {
            if (labels[k] === -2 || labels[k] === -1) queue.push(k);
          }
        }
      }
      clusterId++;
    }
    const noise: number[] = [];
    for (let i = 0; i < n; i++) {
      if (labels[i] === -1) noise.push(i);
      else if (labels[i] === -2) labels[i] = -1; // shouldn't happen; treat as noise
    }
    return { labels, clusterCount: clusterId, noiseIndices: noise };
  }

  private computeDistances(samples: readonly FeatureVector[]): Float64Array {
    const n = samples.length;
    const d = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = this.distance(samples[i], samples[j]);
        d[i * n + j] = v;
        d[j * n + i] = v;
      }
    }
    return d;
  }

  private regionQuery(dist: Float64Array, i: number): number[] {
    const n = Math.sqrt(dist.length);
    const out: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j !== i && dist[i * n + j] <= this.eps) out.push(j);
    }
    return out;
  }
}

/**
 * Local Outlier Factor: compares the local density of a point to that of
 * its k nearest neighbors. LOF ≈ 1 means similar density; >> 1 means the
 * point is in a sparser region than its neighbors (outlier).
 */
export class LofDetector {
  private readonly k: number;
  private readonly distance: DistanceFn;

  constructor(k = 5, distance: DistanceFn = euclideanDistance) {
    this.k = k;
    this.distance = distance;
  }

  /**
   * Compute LOF score for every sample. Scores near 1 are normal;
   * significantly > 1 are outliers.
   */
  scores(samples: readonly FeatureVector[]): number[] {
    const n = samples.length;
    if (n < this.k + 2) return samples.map(() => 1);
    const dist = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = this.distance(samples[i], samples[j]);
        dist[i * n + j] = v;
        dist[j * n + i] = v;
      }
    }
    const neighbors: number[][] = [];
    const kDist = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const order: number[] = [];
      for (let j = 0; j < n; j++) {
        if (j !== i) order.push(j);
      }
      order.sort((a, b) => dist[i * n + a] - dist[i * n + b]);
      const nb = order.slice(0, this.k);
      neighbors.push(nb);
      kDist[i] = dist[i * n + nb[nb.length - 1]];
    }
    // reachability distance: max(k-distance(o), d(p,o))
    const lrd = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const j of neighbors[i]) {
        sum += Math.max(kDist[j], dist[i * n + j]);
      }
      lrd[i] = neighbors[i].length / Math.max(1e-12, sum);
    }
    const lof = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const j of neighbors[i]) sum += lrd[j];
      lof[i] = sum / (neighbors[i].length * Math.max(1e-12, lrd[i]));
    }
    return lof;
  }
}
