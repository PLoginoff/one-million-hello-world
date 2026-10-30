/**
 * Column Statistics — table-level metadata for cost-based planning.
 *
 * Complements the per-chunk zone maps in `engine/ColumnStorageEngine`:
 * these are *table-wide* statistics used by the planner to estimate
 * predicate selectivity and join cardinalities before touching data.
 *
 *   - `ColumnStats`: min, max, null fraction, distinct count
 *     (HyperLogLog-style estimate via harmonic mean of trailing-zero
 *     buckets — a simple Flajolet-Martin sketch), and an equi-height
 *     histogram for range selectivity.
 *   - `TableStats`: row count + per-column stats.
 *   - Selectivity estimation: equality ≈ 1/ndv, range via histogram
 *     overlap, conjunction = independence assumption (product),
 *     disjunction = inclusion-exclusion.
 *
 * @module DataWarehouse/Engine2
 */

import { Scalar } from '../engine/ColumnStorageEngine';

/** Equi-height histogram over a numeric column. */
export class Histogram {
  /** bucket upper-bounds, ascending; each holds ~equal row counts */
  private readonly bounds: number[];
  private readonly rowsPerBucket: number;

  constructor(sortedValues: readonly number[], buckets = 32) {
    this.bounds = [];
    if (sortedValues.length === 0) {
      this.rowsPerBucket = 0;
      return;
    }
    const b = Math.max(1, Math.min(buckets, sortedValues.length));
    this.rowsPerBucket = sortedValues.length / b;
    for (let i = 1; i <= b; i++) {
      this.bounds.push(sortedValues[Math.min(sortedValues.length - 1, Math.ceil((i * sortedValues.length) / b) - 1)]);
    }
  }

  /**
   * Fraction of rows with lo <= v <= hi, estimated by bucket overlap —
   * uniform distribution assumed within each bucket.
   */
  rangeSelectivity(lo: number, hi: number): number {
    if (this.bounds.length === 0) return 0;
    let covered = 0;
    let prev = -Infinity;
    for (let i = 0; i < this.bounds.length; i++) {
      const bLo = prev;
      const bHi = this.bounds[i];
      const oLo = Math.max(lo, bLo);
      const oHi = Math.min(hi, bHi);
      if (oHi >= oLo) {
        const width = bHi - bLo;
        const frac = width > 0 ? Math.min(1, (oHi - oLo) / width) : 1;
        covered += frac * this.rowsPerBucket;
      }
      prev = bHi;
    }
    return Math.min(1, covered / (this.bounds.length * this.rowsPerBucket));
  }

  /** Fraction of rows with v <= bound. */
  lteSelectivity(bound: number): number {
    return this.rangeSelectivity(-Infinity, bound);
  }

  get bucketCount(): number {
    return this.bounds.length;
  }
}

/** Per-column statistics. */
export interface ColumnStats {
  readonly name: string;
  readonly min: Scalar;
  readonly max: Scalar;
  readonly nullFraction: number;
  /** Number of distinct values (estimated). */
  readonly ndv: number;
  readonly histogram?: Histogram;
}

/** Table-level statistics. */
export interface TableStats {
  readonly table: string;
  readonly rowCount: number;
  readonly columns: ReadonlyMap<string, ColumnStats>;
}

/**
 * Flajolet–Martin / LogLog-style distinct-value estimator: hash each
 * value, bucket by leading bits, take the harmonic mean of the largest
 * trailing-zero run per bucket. O(n) time, O(2^k) memory.
 */
export class DistinctEstimator {
  private readonly k: number;
  private readonly buckets: Uint8Array;

  constructor(k = 10 /* 1024 buckets → ~2.6% std error */) {
    this.k = k;
    this.buckets = new Uint8Array(1 << k);
  }

  add(value: Scalar): void {
    const h = hashScalar(value);
    // Low k bits pick the bucket (FNV low bits are well-mixed).
    const bucket = Number(h & BigInt((1 << this.k) - 1));
    const rest = h >> BigInt(this.k);
    // Rho = position of the lowest set bit in the remaining bits + 1.
    let rho = 1;
    let w = rest;
    while ((w & 1n) === 0n && rho <= 64) {
      w >>= 1n;
      rho++;
    }
    if (rho > this.buckets[bucket]) this.buckets[bucket] = rho;
  }

  /** Estimated number of distinct values. */
  estimate(): number {
    const m = this.buckets.length;
    let sum = 0;
    for (const b of this.buckets) sum += 2 ** -b;
    const alpha = 0.79402; // alpha_m for m=1024
    const est = (alpha * m * m) / sum;
    // small-range correction (linear counting)
    let zeros = 0;
    for (const b of this.buckets) if (b === 0) zeros++;
    if (est <= (5 / 2) * m && zeros > 0) {
      return m * Math.log(m / zeros);
    }
    return est;
  }
}

/** Total order over scalars for min/max — numbers < strings < booleans < null. */
function cmpScalar(a: Scalar, b: Scalar): number {
  const rank = (v: Scalar) => (v === null ? 3 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (a === b) return 0;
  return a! < b! ? -1 : 1;
}

/** Stable 64-bit hash of a scalar — FNV-1a over its string repr. */
function hashScalar(v: Scalar): bigint {
  const s = typeof v + ':' + String(v);
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h;
}

/** Builds TableStats by scanning rows once. O(rows × cols). */
export class StatsCollector {
  /**
   * Collect stats for a table from its rows.
   * Numeric columns get histograms; all get min/max/null/ndv.
   */
  static collect(
    table: string,
    rows: readonly Record<string, Scalar>[],
    histogramBuckets = 32
  ): TableStats {
    const colValues = new Map<string, Scalar[]>();
    const nulls = new Map<string, number>();
    const ndvs = new Map<string, DistinctEstimator>();

    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (!colValues.has(k)) {
          colValues.set(k, []);
          nulls.set(k, 0);
          ndvs.set(k, new DistinctEstimator());
        }
        if (v === null) {
          nulls.set(k, nulls.get(k)! + 1);
        } else {
          colValues.get(k)!.push(v);
          ndvs.get(k)!.add(v);
        }
      }
    }

    const columns = new Map<string, ColumnStats>();
    for (const [name, vals] of colValues) {
      let min: Scalar = null;
      let max: Scalar = null;
      const nums: number[] = [];
      for (const v of vals) {
        if (v === null) continue;
        if (min === null || cmpScalar(v, min) < 0) min = v;
        if (max === null || cmpScalar(v, max) > 0) max = v;
        if (typeof v === 'number') nums.push(v);
      }
      columns.set(name, {
        name,
        min,
        max,
        nullFraction: rows.length > 0 ? (nulls.get(name) ?? 0) / rows.length : 0,
        ndv: ndvs.get(name)!.estimate(),
        histogram: nums.length >= 4 ? new Histogram(nums.slice().sort((a, b) => a - b), histogramBuckets) : undefined,
      });
    }
    return { table, rowCount: rows.length, columns };
  }
}

/** Selectivity estimate for a single predicate, ∈ [0,1]. */
export function estimateSelectivity(
  stats: ColumnStats | undefined,
  op: string,
  value: Scalar | readonly Scalar[],
  rowCount: number
): number {
  if (!stats) return 1;
  const nf = stats.nullFraction;
  switch (op) {
    case 'isNull':
      return nf;
    case 'notNull':
      return 1 - nf;
    case 'eq': {
      if (stats.ndv <= 0) return 0;
      return Math.min(1, 1 / stats.ndv);
    }
    case 'neq':
      return stats.ndv > 0 ? 1 - 1 / stats.ndv : 1;
    case 'lt':
    case 'lte': {
      if (stats.histogram && typeof value === 'number') {
        return stats.histogram.lteSelectivity(value);
      }
      // fallback: uniform between min/max
      const mn = Number(stats.min);
      const mx = Number(stats.max);
      const v = Number(value);
      if (!Number.isFinite(mn) || !Number.isFinite(mx) || mx === mn) return 0.5;
      return Math.min(1, Math.max(0, (v - mn) / (mx - mn)));
    }
    case 'gt':
    case 'gte': {
      if (stats.histogram && typeof value === 'number') {
        return 1 - stats.histogram.lteSelectivity(value);
      }
      const mn = Number(stats.min);
      const mx = Number(stats.max);
      const v = Number(value);
      if (!Number.isFinite(mn) || !Number.isFinite(mx) || mx === mn) return 0.5;
      return Math.min(1, Math.max(0, (mx - v) / (mx - mn)));
    }
    case 'in': {
      const n = Array.isArray(value) ? value.length : 1;
      return stats.ndv > 0 ? Math.min(1, n / stats.ndv) : 1;
    }
    default:
      return 1;
  }
}
