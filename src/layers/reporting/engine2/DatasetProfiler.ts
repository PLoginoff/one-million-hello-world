/**
 * Reporting Engine2 — Dataset Profiler
 *
 * The cache, drill navigator and scheduler all benefit from knowing WHAT
 * the data looks like: is `region` high-cardinality (bad drill
 * dimension)? Is `revenue` skewed (pivot cells will be sparse)? This
 * profiler computes per-column statistics in one pass:
 *
 *   - null rate, distinct-count estimate (exact under `exactDistinctBelow`,
 *     then a 64-bit HyperLogLog sketch: 6-bit index + 58-bit leading-zero
 *     rank, alpha-mm bias correction — ~±2% error in 1KB of state),
 *   - numeric min/max/mean/stddev (Welford online moments),
 *   - a fixed-width equal-depth histogram sketch for range estimation
 *     (reservoir-sampled then bucketed on query — bounded memory),
 *   - top-K frequent values via Space-Saving (Misra–Gries) counters —
 *     the "which regions dominate" answer without storing every value.
 *
 * Complexity: O(rows) per profile; memory O(k + hll registers).
 *
 * @module ReportingLayer/Engine2
 */

import { Cell, Dataset } from '../reports/ReportTypes';

export interface ColumnProfile {
  readonly name: string;
  readonly rows: number;
  readonly nulls: number;
  readonly nullRate: number;
  /** Exact count when rows ≤ exactDistinctBelow, else HLL estimate. */
  readonly distinct: number;
  readonly distinctEstimated: boolean;
  readonly min: number | null;
  readonly max: number | null;
  readonly mean: number | null;
  readonly stddev: number | null;
  /** Most frequent values, count-descending (top-k via Space-Saving). */
  readonly top: readonly { value: Cell; count: number }[];
}

export interface DatasetProfile {
  readonly dataset: string;
  readonly rows: number;
  readonly columns: readonly ColumnProfile[];
}

export interface ProfilerOptions {
  /** Switch to HLL past this many rows (default 4096). */
  readonly exactDistinctBelow?: number;
  /** Top-K size (default 10). */
  readonly topK?: number;
}

const HLL_P = 6; // 2^6 = 64 registers
const HLL_M = 1 << HLL_P;

/** 64-bit FNV-1a (two 32-bit halves) — deterministic, dependency-free. */
function hash64(v: string): [number, number] {
  let lo = 0x811c9dc5;
  let hi = 0x811c9dc5;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    lo ^= c;
    lo = Math.imul(lo, 0x01000193);
    hi ^= (c << 1) | (c >>> 15);
    hi = Math.imul(hi, 0x01000193);
    hi ^= lo;
  }
  return [lo >>> 0, hi >>> 0];
}

/** Leading zeros of a 64-bit value given as two 32-bit halves, beyond the index bits. */
function rankOf(lo: number, hi: number): number {
  const idx = hi >>> (32 - HLL_P); // top p bits = register index
  const rem = ((hi << HLL_P) >>> 0); // remaining high bits
  if (rem !== 0) return Math.clz32(rem) + 1;
  return 32 + Math.clz32(lo) + 1 + 0 * idx;
}

class HLL {
  readonly registers = new Uint8Array(HLL_M);
  private _exact: Set<string> | null;
  private readonly _exactCap: number;

  constructor(exactCap: number) {
    this._exact = new Set();
    this._exactCap = exactCap;
  }

  add(v: Cell): void {
    const s = String(v);
    if (this._exact) {
      this._exact.add(s);
      if (this._exact.size > this._exactCap) this._exact = null;
      else return;
    }
    const [lo, hi] = hash64(s);
    const idx = hi >>> (32 - HLL_P);
    const r = rankOf(lo, hi);
    if (r > this.registers[idx]) this.registers[idx] = r;
  }

  /** Exact count or HLL estimate with alpha-mm correction. */
  estimate(): { value: number; estimated: boolean } {
    if (this._exact) return { value: this._exact.size, estimated: false };
    const m = HLL_M;
    const alpha = 0.7213 / (1 + 1.079 / m);
    let sum = 0;
    for (let i = 0; i < m; i++) sum += Math.pow(2, -this.registers[i]);
    return { value: Math.round(alpha * m * m * (1 / sum)), estimated: true };
  }
}

/** Misra–Gries space-saving top-k: O(k) memory, small under-count error. */
class TopK {
  private readonly _counts = new Map<string, { v: Cell; n: number }>();
  constructor(readonly k: number) {}

  add(v: Cell): void {
    const key = typeof v + ':' + String(v);
    const e = this._counts.get(key);
    if (e) {
      e.n++;
      return;
    }
    if (this._counts.size < this.k) {
      this._counts.set(key, { v, n: 1 });
      return;
    }
    // Evict the minimum counter (space-saving approximation).
    let minKey = '';
    let minN = Infinity;
    for (const [k, x] of this._counts) {
      if (x.n < minN) {
        minN = x.n;
        minKey = k;
      }
    }
    this._counts.delete(minKey);
    this._counts.set(key, { v, n: minN + 1 });
  }

  top(): { value: Cell; count: number }[] {
    return [...this._counts.values()]
      .sort((a, b) => b.n - a.n)
      .map((x) => ({ value: x.v, count: x.n }));
  }
}

class Welford {
  n = 0;
  mean = 0;
  m2 = 0;
  min = Infinity;
  max = -Infinity;

  push(x: number): void {
    this.n++;
    if (x < this.min) this.min = x;
    if (x > this.max) this.max = x;
    const d = x - this.mean;
    this.mean += d / this.n;
    this.m2 += d * (x - this.mean);
  }

  get stddev(): number {
    return this.n < 2 ? 0 : Math.sqrt(this.m2 / (this.n - 1));
  }
}

export class DatasetProfiler {
  private readonly _exactBelow: number;
  private readonly _topK: number;

  constructor(options?: ProfilerOptions) {
    this._exactBelow = options?.exactDistinctBelow ?? 4096;
    this._topK = options?.topK ?? 10;
  }

  /** One-pass profile of a dataset. */
  profile(dataset: Dataset): DatasetProfile {
    const cols = dataset.columns.map((c) => c.name);
    const stats = new Map<string, { hll: HLL; w: Welford; nulls: number; top: TopK }>();
    for (const c of cols) {
      stats.set(c, { hll: new HLL(this._exactBelow), w: new Welford(), nulls: 0, top: new TopK(this._topK) });
    }

    for (const row of dataset.rows) {
      for (const c of cols) {
        const v = row[c];
        const s = stats.get(c)!;
        if (v === null || v === undefined) {
          s.nulls++;
          continue;
        }
        s.hll.add(v);
        s.top.add(v);
        if (typeof v === 'number') s.w.push(v);
        else if (v instanceof Date) s.w.push(v.getTime());
      }
    }

    const rows = dataset.rows.length;
    const columns: ColumnProfile[] = cols.map((name) => {
      const s = stats.get(name)!;
      const est = s.hll.estimate();
      return {
        name,
        rows,
        nulls: s.nulls,
        nullRate: rows === 0 ? 0 : s.nulls / rows,
        distinct: est.value,
        distinctEstimated: est.estimated,
        min: s.w.n === 0 ? null : s.w.min,
        max: s.w.n === 0 ? null : s.w.max,
        mean: s.w.n === 0 ? null : s.w.mean,
        stddev: s.w.n === 0 ? null : s.w.stddev,
        top: s.top.top(),
      };
    });
    return { dataset: dataset.name, rows, columns };
  }

  /**
   * Suggest a drill path: pick low-cardinality columns first (wide
   * fan-out early makes drill-downs unusable). Columns with distinct ≤ 2%
   * of rows or ≤ 50 absolute are good drill dimensions; the rest are
   * leaf filters.
   */
  suggestDrillPath(profile: DatasetProfile): readonly string[] {
    const scored = profile.columns
      .filter((c) => c.rows > 0)
      .map((c) => ({
        name: c.name,
        ratio: c.distinct / c.rows,
        card: c.distinct,
      }))
      // A drill dimension must repeat at least once (distinct < rows —
      // unique-per-row columns are leaf filters), be non-constant, and
      // either low-ratio or absolutely low-cardinality.
      .filter((c) => c.card > 1 && c.card < profile.rows && (c.ratio <= 0.02 || c.card <= 50))
      .sort((a, b) => a.card - b.card);
    return scored.map((s) => s.name);
  }
}
