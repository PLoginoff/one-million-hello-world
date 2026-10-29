/**
 * IsolationForest
 *
 * Multivariate anomaly detection via isolation: randomly partition the
 * feature space; anomalies isolate in fewer splits. Implements the Liu,
 * Ting & Zhou (2008) algorithm with a subsample of the data and
 * normalized path-length scoring.
 */

import { DataPoint, Anomaly } from './Types';

export type FeatureVector = readonly number[];

export interface IsolationForestOptions {
  /** number of trees */
  readonly trees?: number;
  /** subsample size per tree (paper default 256) */
  readonly subsampleSize?: number;
  /** max tree height; defaults to ceil(log2(subsampleSize)) */
  readonly maxDepth?: number;
  readonly seed?: number;
  /** score threshold in (0,1); typical ~0.5-0.6 */
  readonly threshold?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ITreeNode {
  readonly feature: number;
  readonly split: number;
  readonly left?: ITreeNode;
  readonly right?: ITreeNode;
  readonly size: number; // samples reaching this node
  readonly depth: number;
}

/** Average path length of unsuccessful BST search, c(n) — normalization. */
export function cFactor(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  // 2*(ln(n-1) + Euler-Mascheroni) - 2*(n-1)/n
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

function buildTree(
  samples: readonly FeatureVector[],
  depth: number,
  maxDepth: number,
  rand: () => number,
  dims: number
): ITreeNode {
  if (depth >= maxDepth || samples.length <= 1) {
    return { feature: -1, split: 0, size: samples.length, depth };
  }
  // pick a random feature with non-zero range
  const candidates: number[] = [];
  for (let f = 0; f < dims; f++) {
    let min = Infinity;
    let max = -Infinity;
    for (const s of samples) {
      if (s[f] < min) min = s[f];
      if (s[f] > max) max = s[f];
    }
    if (max > min) candidates.push(f);
  }
  if (candidates.length === 0) {
    return { feature: -1, split: 0, size: samples.length, depth };
  }
  const feature = candidates[Math.floor(rand() * candidates.length)];
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (s[feature] < min) min = s[feature];
    if (s[feature] > max) max = s[feature];
  }
  const split = min + rand() * (max - min);
  const left: FeatureVector[] = [];
  const right: FeatureVector[] = [];
  for (const s of samples) {
    if (s[feature] < split) left.push(s);
    else right.push(s);
  }
  return {
    feature,
    split,
    size: samples.length,
    depth,
    left: buildTree(left, depth + 1, maxDepth, rand, dims),
    right: buildTree(right, depth + 1, maxDepth, rand, dims),
  };
}

function pathLength(node: ITreeNode, x: FeatureVector): number {
  if (node.left === undefined || node.right === undefined) {
    // leaf: account for remaining unsplit samples
    return node.depth + cFactor(node.size);
  }
  if (x[node.feature] < node.split) {
    return pathLength(node.left, x);
  }
  return pathLength(node.right, x);
}

export class IsolationForest {
  readonly name = 'isolation-forest';
  private readonly trees: ITreeNode[] = [];
  private readonly options: Required<Omit<IsolationForestOptions, 'maxDepth'>> & {
    maxDepth?: number;
  };
  private subsampleSize: number;
  private trained = false;

  constructor(options: IsolationForestOptions = {}) {
    this.options = {
      trees: options.trees ?? 100,
      subsampleSize: options.subsampleSize ?? 256,
      seed: options.seed ?? 42,
      threshold: options.threshold ?? 0.6,
      maxDepth: options.maxDepth,
    };
    this.subsampleSize = this.options.subsampleSize;
  }

  fit(samples: readonly FeatureVector[]): void {
    this.trees.length = 0;
    if (samples.length === 0) {
      this.trained = false;
      return;
    }
    const dims = samples[0].length;
    const rand = mulberry32(this.options.seed);
    this.subsampleSize = Math.min(this.options.subsampleSize, samples.length);
    const maxDepth =
      this.options.maxDepth ?? Math.ceil(Math.log2(this.subsampleSize));
    for (let t = 0; t < this.options.trees; t++) {
      // random subsample without replacement
      const idx = samples.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      const sample = idx.slice(0, this.subsampleSize).map((i) => samples[i]);
      this.trees.push(buildTree(sample, 0, maxDepth, rand, dims));
    }
    this.trained = true;
  }

  /**
   * Anomaly score in (0,1]: s = 2^(-E(h)/c(n)).
   * ~0.5 = normal, closer to 1 = anomalous.
   */
  score(x: FeatureVector): number {
    if (!this.trained || this.trees.length === 0) return 0;
    let sum = 0;
    for (const tree of this.trees) {
      sum += pathLength(tree, x);
    }
    const avg = sum / this.trees.length;
    const c = cFactor(this.subsampleSize);
    if (c <= 0) return 0;
    return Math.pow(2, -avg / c);
  }

  isAnomaly(x: FeatureVector): boolean {
    return this.score(x) >= this.options.threshold;
  }

  /** Score a 1-D series as single-feature vectors. */
  detect(series: readonly DataPoint[]): Anomaly[] {
    const samples: FeatureVector[] = series.map((p) => [p.value]);
    if (!this.trained) this.fit(samples);
    const anomalies: Anomaly[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = this.score(samples[i]);
      if (s >= this.options.threshold) {
        anomalies.push({
          index: i,
          timestamp: series[i].timestamp,
          value: series[i].value,
          score: s,
          severity: Math.min(1, (s - 0.5) * 2),
          detector: this.name,
          explanation: `isolation score ${s.toFixed(3)} >= ${this.options.threshold}`,
        });
      }
    }
    return anomalies;
  }
}
