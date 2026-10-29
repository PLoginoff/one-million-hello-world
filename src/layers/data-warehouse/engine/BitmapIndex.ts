/**
 * Bitmap Secondary Index
 *
 * A bitmap index maintains one bit-vector per distinct column value;
 * position i set ⇒ row i has that value. Point and range lookups then
 * become bitwise ops over the vectors:
 *
 *   eq(v)            → bitmap[v]
 *   in(v1..vk)       → OR of k bitmaps
 *   lt/gt/between    → OR of bitmaps in the value range (sorted domain)
 *   conjunction      → AND across column bitmaps
 *
 * This is the classic warehouse index for low/medium-cardinality
 * columns (gender, status, region, month). Memory ≈ distinct × rows/8
 * bytes — proportional to cardinality, which is why high-cardinality
 * columns are rejected by `adviseIndexable`.
 *
 * Internally uses `RawBitmap`, a random-access bit array over a
 * Uint32Array, so OR/AND run word-wise at ~32 rows per instruction.
 *
 * @module DataWarehouse/Engine
 */

import { ColumnarTable, Scalar, compareScalars } from './ColumnStorageEngine';

/* ------------------------------------------------------------------------ */
/* RawBitmap — random-access bit vector                                      */
/* ------------------------------------------------------------------------ */

/** Fixed-capacity bit vector with word-level boolean ops. */
export class RawBitmap {
  private readonly _words: Uint32Array;
  readonly length: number;

  constructor(length: number) {
    this.length = length;
    this._words = new Uint32Array(Math.ceil(length / 32));
  }

  /** Set bit i. O(1). */
  set(i: number): void {
    this._words[i >>> 5] |= 1 << (i & 31);
  }

  /** Test bit i. O(1). */
  get(i: number): boolean {
    return (this._words[i >>> 5] & (1 << (i & 31))) !== 0;
  }

  /** Popcount over all words. O(words). */
  cardinality(): number {
    let n = 0;
    for (const w of this._words) {
      let v = w;
      while (v !== 0) {
        v &= v - 1;
        n++;
      }
    }
    return n;
  }

  /** this |= other (word-wise OR). O(words). */
  or(other: RawBitmap): void {
    const n = Math.min(this._words.length, other._words.length);
    for (let i = 0; i < n; i++) this._words[i] |= other._words[i];
  }

  /** this &= other (word-wise AND). O(words). */
  and(other: RawBitmap): void {
    const n = Math.min(this._words.length, other._words.length);
    for (let i = 0; i < n; i++) this._words[i] &= other._words[i];
  }

  /** this &= ~other. O(words). */
  andNot(other: RawBitmap): void {
    const n = Math.min(this._words.length, other._words.length);
    for (let i = 0; i < n; i++) this._words[i] &= ~other._words[i];
  }

  /** Positions of set bits, ascending. O(words + cardinality). */
  toArray(): number[] {
    const out: number[] = [];
    for (let w = 0; w < this._words.length; w++) {
      let v = this._words[w];
      while (v !== 0) {
        const lsb = v & -v;
        out.push(w * 32 + (31 - Math.clz32(lsb)));
        v &= v - 1;
      }
    }
    return out;
  }

  byteSize(): number {
    return this._words.byteLength;
  }

  static or(a: RawBitmap, b: RawBitmap): RawBitmap {
    const out = a.clone();
    out.or(b);
    return out;
  }

  static and(a: RawBitmap, b: RawBitmap): RawBitmap {
    const out = a.clone();
    out.and(b);
    return out;
  }

  clone(): RawBitmap {
    const c = new RawBitmap(this.length);
    c._words.set(this._words);
    return c;
  }
}

/* ------------------------------------------------------------------------ */
/* BitmapIndex                                                              */
/* ------------------------------------------------------------------------ */

/** One index on one column of one table. */
export class BitmapIndex {
  readonly column: string;
  private readonly _values: Scalar[] = []; // sorted distinct domain
  private readonly _bits: RawBitmap[] = []; // parallel to _values
  private readonly _byValue = new Map<string, number>(); // scalarKey → domain idx
  private _nullBitmap = new RawBitmap(0);
  private _rowCount = 0;

  private constructor(column: string) {
    this.column = column;
  }

  /**
   * Build by scanning the table once. O(rows + distinct·words).
   */
  static build(table: ColumnarTable, column: string): BitmapIndex {
    const idx = new BitmapIndex(column);
    const scan = table.scan([], [column]);
    idx._rowCount = scan.rows.length;
    idx._nullBitmap = new RawBitmap(scan.rows.length);
    const bits = new Map<string, RawBitmap>();
    const values = new Map<string, Scalar>();
    for (let i = 0; i < scan.rows.length; i++) {
      const v = scan.rows[i][column];
      if (v === null) {
        idx._nullBitmap.set(i);
        continue;
      }
      const k = scalarKey(v);
      let bv = bits.get(k);
      if (bv === undefined) {
        bv = new RawBitmap(scan.rows.length);
        bits.set(k, bv);
        values.set(k, v);
      }
      bv.set(i);
    }
    const sorted = [...values.entries()].sort((a, b) => compareScalars(a[1], b[1]));
    for (const [k, v] of sorted) {
      idx._byValue.set(k, idx._values.length);
      idx._values.push(v);
      idx._bits.push(bits.get(k) as RawBitmap);
    }
    return idx;
  }

  get distinctValues(): number {
    return this._values.length;
  }

  get rowCount(): number {
    return this._rowCount;
  }

  /** Memory footprint in bytes (bitmaps only). */
  byteSize(): number {
    let t = this._nullBitmap.byteSize();
    for (const b of this._bits) t += b.byteSize();
    return t;
  }

  /** Bitmap of rows equal to `v`. */
  bitmapFor(v: Scalar): RawBitmap {
    if (v === null) return this._nullBitmap.clone();
    const i = this._byValue.get(scalarKey(v));
    if (i === undefined) return new RawBitmap(this._rowCount);
    return this._bits[i].clone();
  }

  /** Row ids equal to `v`. */
  eq(v: Scalar): number[] {
    return this.bitmapFor(v).toArray();
  }

  /** Row ids where column ∈ values (OR over bitmaps). */
  in(values: readonly Scalar[]): number[] {
    const acc = new RawBitmap(this._rowCount);
    for (const v of values) {
      if (v === null) acc.or(this._nullBitmap);
      else {
        const i = this._byValue.get(scalarKey(v));
        if (i !== undefined) acc.or(this._bits[i]);
      }
    }
    return acc.toArray();
  }

  /**
   * Range lookup: rows with min ≤ v ≤ max (bounds inclusive; null bound
   * = open end). Domain is sorted, so the qualifying bitmaps form a
   * contiguous slice — binary search both ends, then OR that slice.
   */
  range(min: Scalar | null, max: Scalar | null): number[] {
    return this.rangeBitmap(min, max).toArray();
  }

  /** Range lookup returning a bitmap for further boolean composition. */
  rangeBitmap(min: Scalar | null, max: Scalar | null): RawBitmap {
    const acc = new RawBitmap(this._rowCount);
    const n = this._values.length;
    let lo = 0;
    let hi = n - 1;
    if (min !== null) {
      lo = lowerBound(this._values, min);
      if (lo >= n) return acc;
    }
    if (max !== null) {
      hi = upperBound(this._values, max) - 1;
      if (hi < 0) return acc;
    }
    if (hi < lo) return acc;
    for (let i = lo; i <= hi; i++) acc.or(this._bits[i]);
    return acc;
  }

  /**
   * Should this column be bitmap-indexed? Cardinality heuristic: index
   * pays off when distinct/rows ≤ ~10% (each bitmap is rows/8 bytes, so
   * 10% cardinality → index ≈ 1.25× the raw column size).
   */
  static adviseIndexable(
    rowCount: number,
    distinctCount: number
  ): { advisable: boolean; estimatedBytes: number; reason: string } {
    const bytes = Math.ceil(rowCount / 8) * distinctCount + Math.ceil(rowCount / 8);
    const ratio = rowCount === 0 ? 0 : distinctCount / rowCount;
    if (ratio <= 0.1) {
      return { advisable: true, estimatedBytes: bytes, reason: `cardinality ratio ${(ratio * 100).toFixed(1)}% ≤ 10%` };
    }
    return {
      advisable: false,
      estimatedBytes: bytes,
      reason: `cardinality ratio ${(ratio * 100).toFixed(1)}% too high; use sorted zone-map pruning instead`,
    };
  }
}

/* ------------------------------------------------------------------------ */
/* Multi-column index manager                                               */
/* ------------------------------------------------------------------------ */

/**
 * Holds bitmap indexes for several columns of a table and answers
 * conjunctive lookups by ANDing bitmaps word-wise — the bit-sliced
 * index technique used by Pilosa/ClickHouse for multi-column filters.
 */
export class BitmapIndexSet {
  private readonly _indexes = new Map<string, BitmapIndex>();
  private readonly _table: ColumnarTable;

  constructor(table: ColumnarTable) {
    this._table = table;
  }

  buildIndex(column: string): BitmapIndex {
    const idx = BitmapIndex.build(this._table, column);
    this._indexes.set(column, idx);
    return idx;
  }

  index(column: string): BitmapIndex | undefined {
    return this._indexes.get(column);
  }

  /**
   * Conjunctive equality lookup: `{region: 'us', tier: 'gold'}` → row ids
   * satisfying all. Bitmap-AND on indexed columns; residual unindexed
   * conditions are filtered by row materialization.
   */
  lookup(conditions: Record<string, Scalar>): number[] {
    return this.lookupBitmap(conditions).toArray();
  }

  /** Same as lookup but returns the bitmap (for further composition). */
  lookupBitmap(conditions: Record<string, Scalar>): RawBitmap {
    const keys = Object.keys(conditions);
    let acc: RawBitmap | null = null;
    const unindexed: Record<string, Scalar> = {};
    for (const col of keys) {
      const idx = this._indexes.get(col);
      if (idx === undefined) {
        unindexed[col] = conditions[col];
        continue;
      }
      const bm = idx.bitmapFor(conditions[col]);
      acc = acc === null ? bm : RawBitmap.and(acc, bm);
    }
    if (acc === null) {
      acc = new RawBitmap(this._table.rowCount);
      for (let i = 0; i < this._table.rowCount; i++) acc.set(i);
    }
    if (Object.keys(unindexed).length === 0) return acc;
    // Filter residual conditions by materializing candidate rows.
    const filtered = new RawBitmap(this._table.rowCount);
    for (const id of acc.toArray()) {
      const row = this._table.rowAt(id);
      let ok = true;
      for (const [c, v] of Object.entries(unindexed)) {
        if (row[c] !== v) {
          ok = false;
          break;
        }
      }
      if (ok) filtered.set(id);
    }
    return filtered;
  }
}

/* ------------------------------------------------------------------------ */
/* Internals                                                                */
/* ------------------------------------------------------------------------ */

function scalarKey(v: Scalar): string {
  return typeof v + ':' + String(v);
}

function lowerBound(sorted: readonly Scalar[], v: Scalar): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareScalars(sorted[mid], v) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(sorted: readonly Scalar[], v: Scalar): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareScalars(sorted[mid], v) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
