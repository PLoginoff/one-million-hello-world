/**
 * VectorIndex
 *
 * Dense vector storage with cosine/euclidean/dot-product similarity and
 * exact k-NN search, plus an optional random-projection hash index for
 * approximate candidate pruning.
 */

export type DistanceMetric = 'cosine' | 'euclidean' | 'dot';

export interface VectorHit {
  readonly id: string;
  readonly score: number;
}

type Vec = ArrayLike<number>;

function cosine(a: Vec, b: Vec): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function euclidean(a: Vec, b: Vec): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
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

export class VectorIndex {
  private readonly dims: number;
  private readonly metric: DistanceMetric;
  private readonly vectors = new Map<string, Float64Array>();
  /** random-projection buckets: bucketKey -> ids */
  private readonly buckets = new Map<number, Set<string>>();
  private readonly projections: Float64Array[] = [];
  private readonly projectionCount: number;

  constructor(dims: number, metric: DistanceMetric = 'cosine', projections = 8, seed = 42) {
    this.dims = dims;
    this.metric = metric;
    this.projectionCount = projections;
    const rand = mulberry32(seed);
    for (let p = 0; p < projections; p++) {
      const v = new Float64Array(dims);
      for (let i = 0; i < dims; i++) v[i] = rand() * 2 - 1;
      this.projections.push(v);
    }
  }

  add(id: string, vector: readonly number[]): void {
    if (vector.length !== this.dims) {
      throw new Error(`vector dim ${vector.length} != index dim ${this.dims}`);
    }
    this.remove(id);
    const v = Float64Array.from(vector);
    this.vectors.set(id, v);
    const key = this.bucketKey(v);
    let bucket = this.buckets.get(key);
    if (bucket === undefined) {
      bucket = new Set();
      this.buckets.set(key, bucket);
    }
    bucket.add(id);
  }

  remove(id: string): void {
    const v = this.vectors.get(id);
    if (v === undefined) return;
    const key = this.bucketKey(v);
    this.buckets.get(key)?.delete(id);
    this.vectors.delete(id);
  }

  /** Sign-hash of the projection vector for approximate bucketing. */
  private bucketKey(v: Float64Array): number {
    let key = 0;
    for (let p = 0; p < this.projectionCount; p++) {
      let s = 0;
      const proj = this.projections[p];
      for (let i = 0; i < this.dims; i++) s += v[i] * proj[i];
      if (s >= 0) key |= 1 << p;
    }
    return key;
  }

  private score(a: Float64Array | readonly number[], b: Float64Array | readonly number[]): number {
    switch (this.metric) {
      case 'cosine':
        return cosine(a, b);
      case 'dot':
        return dot(a, b);
      case 'euclidean':
        return -euclidean(a, b); // negate: higher = better
    }
  }

  /** Exact k-NN over all vectors. */
  knn(query: readonly number[], k = 10): VectorHit[] {
    if (query.length !== this.dims) {
      throw new Error(`query dim ${query.length} != index dim ${this.dims}`);
    }
    const q: Float64Array = Float64Array.from(query);
    const heap: VectorHit[] = [];
    for (const [id, v] of this.vectors) {
      const s = this.score(q, v);
      heap.push({ id, score: s });
    }
    heap.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return heap.slice(0, k);
  }

  /**
   * Approximate k-NN: only score vectors whose bucket shares at least
   * `minSharedBits` of the projection signature.
   */
  approxKnn(query: readonly number[], k = 10, minSharedBits?: number): VectorHit[] {
    const q: Float64Array = Float64Array.from(query);
    const qKey = this.bucketKey(q);
    const minShared = minSharedBits ?? this.projectionCount - 2;
    const candidates = new Set<string>();
    for (const [key, ids] of this.buckets) {
      const shared = this.projectionCount - popcount(key ^ qKey);
      if (shared >= minShared) {
        for (const id of ids) candidates.add(id);
      }
    }
    const heap: VectorHit[] = [];
    for (const id of candidates) {
      const v = this.vectors.get(id);
      if (v !== undefined) heap.push({ id, score: this.score(q, v) });
    }
    heap.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return heap.slice(0, k);
  }

  size(): number {
    return this.vectors.size;
  }
}

function popcount(n: number): number {
  let c = 0;
  let x = n;
  while (x !== 0) {
    x &= x - 1;
    c++;
  }
  return c;
}
