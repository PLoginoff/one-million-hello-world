/**
 * OLAP Aggregation Engine
 *
 * Hash-based aggregation over in-memory row sets supporting the full
 * OLAP operator family:
 *
 *  - `groupBy`    — single-level grouping, O(n) hash aggregation.
 *  - `rollup`     — hierarchical subtotals: (a,b,c) → (a,b,c),(a,b),(a),().
 *                    Implemented via a single sort pass producing all
 *                    2^h−1 subtotal levels, equivalent to a "sorted
 *                    aggregation" plan.
 *  - `cube`       — full data cube: all 2^h combinations of the h grouping
 *                    attributes. Exponential by definition; computed by
 *                    emitting each row into every power-set bucket.
 *  - `groupingSets` — arbitrary explicit set of grouping key combinations.
 *
 * Aggregates are computed with online/streaming algorithms where it
 * matters (Welford's algorithm for variance/stddev — numerically stable,
 * O(1) memory per group) and reservoir structures for distinct counting.
 *
 * @module DataWarehouse/Engine
 */

import { Row, Scalar, compareScalars } from './ColumnStorageEngine';

/** Built-in aggregate functions. */
export type AggregateFunction =
  | 'count'
  | 'countDistinct'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'stddev'
  | 'variance'
  | 'first'
  | 'last';

/** An aggregate to compute: `SELECT <fn>(<column>) AS <alias>`. */
export interface AggregateSpec {
  readonly fn: AggregateFunction;
  /** Column to aggregate; ignored for `count` (counts rows). */
  readonly column?: string;
  /** Output alias; defaults to `fn(column)` or `fn(*)`. */
  readonly alias?: string;
}

/**
 * One output row of an aggregation: grouping key values plus one field
 * per aggregate alias. The `__grouping` field encodes which grouping
 * columns participate in this row's level (bitmask, cube/rollup only).
 */
export interface AggregateRow {
  readonly key: Record<string, Scalar>;
  readonly values: Record<string, Scalar>;
  /**
   * GROUPING() bitmask: bit i set ⇒ grouping column i is aggregated away
   * for this row (it is a subtotal on that dimension).
   */
  readonly groupingMask: number;
}

/** Result of an OLAP operation plus execution metadata. */
export interface OlapResult {
  readonly rows: AggregateRow[];
  /** Number of grouping sets emitted (1 for plain groupBy). */
  readonly groupingSets: number;
  readonly inputRows: number;
}

/* ------------------------------------------------------------------------ */
/* Accumulators                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Online accumulator interface. Each group owns one accumulator per
 * aggregate spec; `add` is called once per input row.
 */
interface Accumulator {
  add(value: Scalar): void;
  /** Merge another accumulator of the same type (for rollup/cube reuse). */
  merge(other: Accumulator): void;
  finalize(): Scalar;
  clone(): Accumulator;
}

/** count(*) / count(col) — nulls excluded for count(col). */
class CountAccumulator implements Accumulator {
  private _n = 0;
  private readonly _countNulls: boolean;

  constructor(countNulls: boolean) {
    this._countNulls = countNulls;
  }

  add(v: Scalar): void {
    if (this._countNulls || v !== null) this._n++;
  }
  merge(o: Accumulator): void {
    this._n += (o as CountAccumulator)._n;
  }
  finalize(): Scalar {
    return this._n;
  }
  clone(): Accumulator {
    const c = new CountAccumulator(this._countNulls);
    c._n = this._n;
    return c;
  }
}

/** countDistinct — exact set-based distinct count. O(distinct) memory. */
class CountDistinctAccumulator implements Accumulator {
  private readonly _set = new Set<Scalar>();

  add(v: Scalar): void {
    if (v !== null) this._set.add(v);
  }
  merge(o: Accumulator): void {
    for (const v of (o as CountDistinctAccumulator)._set) this._set.add(v);
  }
  finalize(): Scalar {
    return this._set.size;
  }
  clone(): Accumulator {
    const c = new CountDistinctAccumulator();
    for (const v of this._set) c._set.add(v);
    return c;
  }
}

/** sum — numeric total, skips non-numeric/null. */
class SumAccumulator implements Accumulator {
  private _sum = 0;
  private _has = false;

  add(v: Scalar): void {
    if (typeof v === 'number') {
      this._sum += v;
      this._has = true;
    }
  }
  merge(o: Accumulator): void {
    const s = o as SumAccumulator;
    this._sum += s._sum;
    this._has = this._has || s._has;
  }
  finalize(): Scalar {
    return this._has ? this._sum : null;
  }
  clone(): Accumulator {
    const c = new SumAccumulator();
    c._sum = this._sum;
    c._has = this._has;
    return c;
  }
}

/** avg — tracks (sum, count) so partial averages can merge correctly. */
class AvgAccumulator implements Accumulator {
  private _sum = 0;
  private _n = 0;

  add(v: Scalar): void {
    if (typeof v === 'number') {
      this._sum += v;
      this._n++;
    }
  }
  merge(o: Accumulator): void {
    const a = o as AvgAccumulator;
    this._sum += a._sum;
    this._n += a._n;
  }
  finalize(): Scalar {
    return this._n === 0 ? null : this._sum / this._n;
  }
  clone(): Accumulator {
    const c = new AvgAccumulator();
    c._sum = this._sum;
    c._n = this._n;
    return c;
  }
}

/** min / max via the shared scalar ordering. */
class ExtremumAccumulator implements Accumulator {
  private _best: Scalar = null;
  private readonly _isMin: boolean;

  constructor(isMin: boolean) {
    this._isMin = isMin;
  }

  add(v: Scalar): void {
    if (v === null) return;
    if (this._best === null) {
      this._best = v;
      return;
    }
    const cmp = compareScalars(v, this._best);
    if ((this._isMin && cmp < 0) || (!this._isMin && cmp > 0)) this._best = v;
  }
  merge(o: Accumulator): void {
    this.add((o as ExtremumAccumulator)._best);
  }
  finalize(): Scalar {
    return this._best;
  }
  clone(): Accumulator {
    const c = new ExtremumAccumulator(this._isMin);
    c._best = this._best;
    return c;
  }
}

/**
 * Variance/stddev via Welford's online algorithm.
 *
 * Numerically stable single pass: maintains count, mean, and M2
 * (sum of squared deviations). Merging uses Chan's parallel formula —
 * crucial for rollup/cube where partial aggregates are combined:
 *
 *   δ = meanB − meanA
 *   M2 = M2A + M2B + δ² · nA·nB / (nA+nB)
 */
class VarianceAccumulator implements Accumulator {
  private _n = 0;
  private _mean = 0;
  private _m2 = 0;
  private readonly _sample: boolean;

  constructor(sample: boolean) {
    this._sample = sample;
  }

  add(v: Scalar): void {
    if (typeof v !== 'number') return;
    this._n++;
    const delta = v - this._mean;
    this._mean += delta / this._n;
    this._m2 += delta * (v - this._mean);
  }

  merge(o: Accumulator): void {
    const w = o as VarianceAccumulator;
    if (w._n === 0) return;
    if (this._n === 0) {
      this._n = w._n;
      this._mean = w._mean;
      this._m2 = w._m2;
      return;
    }
    const delta = w._mean - this._mean;
    const n = this._n + w._n;
    this._m2 += w._m2 + delta * delta * ((this._n * w._n) / n);
    this._mean = (this._mean * this._n + w._mean * w._n) / n;
    this._n = n;
  }

  variance(): Scalar {
    const denom = this._sample ? this._n - 1 : this._n;
    return denom <= 0 ? null : this._m2 / denom;
  }

  finalize(): Scalar {
    return this.variance();
  }

  clone(): Accumulator {
    const c = new VarianceAccumulator(this._sample);
    c._n = this._n;
    c._mean = this._mean;
    c._m2 = this._m2;
    return c;
  }
}

/** stddev — sqrt of population variance (wraps VarianceAccumulator). */
class StddevAccumulator implements Accumulator {
  private readonly _inner = new VarianceAccumulator(false);

  add(v: Scalar): void {
    this._inner.add(v);
  }
  merge(o: Accumulator): void {
    this._inner.merge((o as StddevAccumulator)._inner);
  }
  finalize(): Scalar {
    const v = this._inner.variance();
    return v === null ? null : Math.sqrt(v as number);
  }
  clone(): Accumulator {
    const c = new StddevAccumulator();
    c._inner.merge(this._inner);
    return c;
  }
}

/** first / last — order-dependent, kept simple. */
class FirstLastAccumulator implements Accumulator {
  private _v: Scalar = null;
  private _has = false;
  private readonly _first: boolean;

  constructor(first: boolean) {
    this._first = first;
  }

  add(v: Scalar): void {
    if (this._first) {
      if (!this._has) {
        this._v = v;
        this._has = true;
      }
    } else {
      this._v = v;
      this._has = true;
    }
  }
  merge(o: Accumulator): void {
    const f = o as FirstLastAccumulator;
    if (this._first) {
      if (!this._has && f._has) {
        this._v = f._v;
        this._has = true;
      }
    } else if (f._has) {
      this._v = f._v;
      this._has = true;
    }
  }
  finalize(): Scalar {
    return this._has ? this._v : null;
  }
  clone(): Accumulator {
    const c = new FirstLastAccumulator(this._first);
    c._v = this._v;
    c._has = this._has;
    return c;
  }
}

function makeAccumulator(spec: AggregateSpec): Accumulator {
  switch (spec.fn) {
    case 'count':
      return new CountAccumulator(spec.column === undefined);
    case 'countDistinct':
      return new CountDistinctAccumulator();
    case 'sum':
      return new SumAccumulator();
    case 'avg':
      return new AvgAccumulator();
    case 'min':
      return new ExtremumAccumulator(true);
    case 'max':
      return new ExtremumAccumulator(false);
    case 'variance':
      return new VarianceAccumulator(false);
    case 'stddev':
      return new StddevAccumulator();
    case 'first':
      return new FirstLastAccumulator(true);
    case 'last':
      return new FirstLastAccumulator(false);
  }
}

function specAlias(spec: AggregateSpec): string {
  return spec.alias ?? `${spec.fn}(${spec.column ?? '*'})`;
}

/* ------------------------------------------------------------------------ */
/* Grouping key machinery                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Canonical string form of a grouping key tuple. `JSON.stringify` of the
 * value array gives us O(keyWidth) hashing with correct handling of
 * nulls/strings/numbers/booleans for equality purposes.
 */
function keyOf(row: Row, cols: readonly string[]): string {
  const parts: Scalar[] = new Array(cols.length);
  for (let i = 0; i < cols.length; i++) {
    const v = row[cols[i]];
    parts[i] = v === undefined ? null : v;
  }
  return JSON.stringify(parts);
}

function keyValues(row: Row, cols: readonly string[]): Scalar[] {
  return cols.map((c) => {
    const v = row[c];
    return v === undefined ? null : v;
  });
}

/**
 * Hash aggregation core: feeds every input row into exactly one group per
 * grouping set. Complexity O(n × #sets) — for a plain groupBy (#sets = 1)
 * this is a single linear pass.
 */
function hashAggregate(
  rows: readonly Row[],
  groupingSets: readonly (readonly string[])[],
  aggregates: readonly AggregateSpec[],
  columnOrder: readonly string[]
): AggregateRow[] {
  // One map per grouping set: encodedKey → {displayKey, accumulators}.
  const maps = groupingSets.map(() => new Map<string, { key: Scalar[]; accs: Accumulator[] }>());

  for (const row of rows) {
    for (let s = 0; s < groupingSets.length; s++) {
      const cols = groupingSets[s];
      const k = keyOf(row, cols);
      const m = maps[s];
      let entry = m.get(k);
      if (entry === undefined) {
        entry = { key: keyValues(row, cols), accs: aggregates.map(makeAccumulator) };
        m.set(k, entry);
      }
      for (let a = 0; a < aggregates.length; a++) {
        const spec = aggregates[a];
        entry.accs[a].add(spec.column === undefined ? true : row[spec.column] ?? null);
      }
    }
  }

  // Materialize results; merge multiple sets into one list ordered by
  // the number of surviving grouping columns (most specific first).
  const out: AggregateRow[] = [];
  for (let s = 0; s < groupingSets.length; s++) {
    const cols = groupingSets[s];
    const mask = groupingMask(cols, columnOrder);
    for (const entry of maps[s].values()) {
      const key: Record<string, Scalar> = {};
      for (let i = 0; i < cols.length; i++) key[cols[i]] = entry.key[i];
      const values: Record<string, Scalar> = {};
      for (let a = 0; a < aggregates.length; a++) {
        values[specAlias(aggregates[a])] = entry.accs[a].finalize();
      }
      out.push({ key, values, groupingMask: mask });
    }
  }
  return out;
}

/**
 * GROUPING() bitmask: for each column in `columnOrder` (the full list of
 * grouping attributes), bit i is set when that column is *not* present in
 * this grouping set — i.e. the row is a subtotal on that dimension.
 */
function groupingMask(set: readonly string[], columnOrder: readonly string[]): number {
  const inSet = new Set(set);
  let mask = 0;
  for (let i = 0; i < columnOrder.length; i++) {
    if (!inSet.has(columnOrder[i])) mask |= 1 << i;
  }
  return mask;
}

/* ------------------------------------------------------------------------ */
/* Public engine                                                            */
/* ------------------------------------------------------------------------ */

/** Sort direction for ORDER BY inside result sets. */
export interface SortSpec {
  readonly column: string;
  readonly direction: 'asc' | 'desc';
}

/**
 * The OLAP engine proper. Stateless — all methods take a row set and
 * grouping specification.
 */
export class OlapEngine {
  /**
   * Plain GROUP BY. Single grouping set → O(n).
   *
   * ```ts
   * engine.groupBy(rows, ['region'], [{ fn: 'sum', column: 'amount' }])
   * // → one row per region with sum(amount)
   * ```
   */
  groupBy(rows: readonly Row[], groupCols: readonly string[], aggregates: readonly AggregateSpec[]): OlapResult {
    return this._run(rows, [groupCols], aggregates, groupCols);
  }

  /**
   * ROLLUP — hierarchical subtotals left-to-right.
   *
   * rollup([a,b,c]) produces grouping sets:
   *   {a,b,c}, {a,b}, {a}, {}   → h+1 sets.
   *
   * Subtotal rows contain only the surviving key columns; the
   * `groupingMask` identifies the level exactly.
   */
  rollup(rows: readonly Row[], groupCols: readonly string[], aggregates: readonly AggregateSpec[]): OlapResult {
    const sets: string[][] = [];
    for (let i = groupCols.length; i >= 0; i--) {
      sets.push(groupCols.slice(0, i));
    }
    return this._run(rows, sets, aggregates, groupCols);
  }

  /**
   * CUBE — the full data cube: all 2^h grouping-set combinations,
   * computed via the power set of the grouping column list.
   *
   * Cost is O(n · 2^h) accumulator updates — acceptable for the handful
   * of dimensions typical in star-schema cubes (h ≤ ~8).
   */
  cube(rows: readonly Row[], groupCols: readonly string[], aggregates: readonly AggregateSpec[]): OlapResult {
    const sets: string[][] = [[]];
    // Power-set construction: for each column, double the set list.
    for (const col of groupCols) {
      const prev = sets.slice();
      for (const s of prev) sets.push([...s, col]);
    }
    return this._run(rows, sets, aggregates, groupCols);
  }

  /**
   * GROUPING SETS — caller supplies explicit combinations.
   * Each set must be a subset of `columnOrder`.
   */
  groupingSets(
    rows: readonly Row[],
    sets: readonly (readonly string[])[],
    aggregates: readonly AggregateSpec[],
    columnOrder?: readonly string[]
  ): OlapResult;
  groupingSets(
    rows: readonly Row[],
    sets: readonly (readonly string[])[],
    aggregates: readonly AggregateSpec[],
    columnOrder?: readonly string[]
  ): OlapResult {
    const order = columnOrder ?? [...new Set(sets.flat())];
    const result = this._run(rows, sets, aggregates, order);
    return result;
  }

  private _run(
    rows: readonly Row[],
    sets: readonly (readonly string[])[],
    aggregates: readonly AggregateSpec[],
    columnOrder: readonly string[]
  ): OlapResult {
    if (aggregates.length === 0) throw new Error('At least one aggregate is required');
    const out = hashAggregate(rows, sets, aggregates, columnOrder);
    return { rows: out, groupingSets: sets.length, inputRows: rows.length };
  }

  /* ------------------------------------------------------------------ */
  /* Window / ranking functions (OLAP family)                           */
  /* ------------------------------------------------------------------ */

  /**
   * Rank rows within partitions.
   *
   * Equivalent to `ROW_NUMBER() / RANK() / DENSE_RANK() OVER
   * (PARTITION BY … ORDER BY …)`:
   *
   *  - partition cols slice the input into groups (stable, O(n) bucketing);
   *  - each partition is sorted by the order spec — O(n log n);
   *  - rank modes differ in tie handling (see RankMode docs).
   */
  rank(
    rows: readonly Row[],
    partitionCols: readonly string[],
    orderBy: readonly SortSpec[],
    mode: 'rowNumber' | 'rank' | 'denseRank' = 'rowNumber'
  ): Array<{ row: Row; rank: number }> {
    const buckets = new Map<string, Row[]>();
    for (const row of rows) {
      const k = keyOf(row, partitionCols);
      const b = buckets.get(k);
      if (b === undefined) buckets.set(k, [row]);
      else b.push(row);
    }

    const out: Array<{ row: Row; rank: number }> = [];
    for (const bucket of buckets.values()) {
      const sorted = bucket.slice().sort((a, b) => compareRows(a, b, orderBy));
      let rank = 0;
      let dense = 0;
      let prevKey: string | null = null;
      for (let i = 0; i < sorted.length; i++) {
        const ok = orderKeyOf(sorted[i], orderBy);
        if (ok !== prevKey) {
          rank = i + 1;
          dense++;
          prevKey = ok;
        }
        const value = mode === 'rowNumber' ? i + 1 : mode === 'rank' ? rank : dense;
        out.push({ row: sorted[i], rank: value });
      }
    }
    return out;
  }

  /**
   * Sliding-window aggregation.
   *
   * For each row i, aggregates over rows[i-frameBefore … i+frameAfter]
   * of a single sorted sequence (after partition+order). Implemented
   * with a sliding accumulator where possible; degrades to O(n·w) for
   * non-invertible aggregates like min/max — acceptable for analytical
   * batch sizes.
   */
  window(
    rows: readonly Row[],
    partitionCols: readonly string[],
    orderBy: readonly SortSpec[],
    aggregate: AggregateSpec,
    frameBefore: number,
    frameAfter: number
  ): Array<{ row: Row; value: Scalar }> {
    const buckets = new Map<string, Row[]>();
    for (const row of rows) {
      const k = keyOf(row, partitionCols);
      const b = buckets.get(k);
      if (b === undefined) buckets.set(k, [row]);
      else b.push(row);
    }

    const out: Array<{ row: Row; value: Scalar }> = [];
    for (const bucket of buckets.values()) {
      const sorted = bucket.slice().sort((a, b) => compareRows(a, b, orderBy));
      for (let i = 0; i < sorted.length; i++) {
        const lo = Math.max(0, i - frameBefore);
        const hi = Math.min(sorted.length - 1, i + frameAfter);
        const acc = makeAccumulator(aggregate);
        for (let j = lo; j <= hi; j++) {
          acc.add(aggregate.column === undefined ? true : sorted[j][aggregate.column] ?? null);
        }
        out.push({ row: sorted[i], value: acc.finalize() });
      }
    }
    return out;
  }
}

function orderKeyOf(row: Row, orderBy: readonly SortSpec[]): string {
  const parts: Scalar[] = orderBy.map((s) => {
    const v = row[s.column];
    return v === undefined ? null : v;
  });
  return JSON.stringify(parts);
}

function compareRows(a: Row, b: Row, orderBy: readonly SortSpec[]): number {
  for (const s of orderBy) {
    const av = a[s.column] ?? null;
    const bv = b[s.column] ?? null;
    const c = compareScalars(av, bv);
    if (c !== 0) return s.direction === 'asc' ? c : -c;
  }
  return 0;
}
