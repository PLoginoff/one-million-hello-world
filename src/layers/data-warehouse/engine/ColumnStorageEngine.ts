/**
 * Columnar Storage Engine
 *
 * In-memory column-oriented storage engine with real encodings:
 *  - Dictionary encoding: O(cardinality) memory for low-cardinality columns;
 *    compression ratio ≈ rowCount / dictionarySize for repeated values.
 *  - Run-length encoding (RLE): O(runs) memory; optimal for sorted/repetitive
 *    data such as status flags and date partitions.
 *  - Bit-packed null bitmaps: 1 bit per row instead of a full word.
 *  - Zone maps (min/max/null stats per chunk) enable chunk-level pruning
 *    during predicate evaluation without decoding.
 *
 * Data layout: a table is split into row groups (chunks) of `chunkSize`
 * rows. Each column within a chunk is encoded independently and the best
 * encoding is chosen per chunk from measured statistics — mirroring how
 * Parquet/ORC pick encodings per stripe.
 *
 * @module DataWarehouse/Engine
 */

/** Supported logical column types. */
export type ColumnType = 'int32' | 'int64' | 'float64' | 'boolean' | 'string' | 'date';

/** Scalar cell value; `null` represents SQL NULL. */
export type Scalar = string | number | boolean | null;

/** Physical encoding selected per column chunk. */
export type Encoding = 'plain' | 'dictionary' | 'rle' | 'dictionary-rle';

/** Column schema definition. */
export interface ColumnSchema {
  readonly name: string;
  readonly type: ColumnType;
  readonly nullable: boolean;
}

/** Comparison operators supported by the scan predicate. */
export type CompareOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'isNull' | 'notNull';

/** A single column predicate used for scans and pruning. */
export interface ColumnPredicate {
  readonly column: string;
  readonly op: CompareOp;
  readonly value?: Scalar | readonly Scalar[];
}

/** Aggregate statistics recorded per encoded column chunk (zone map). */
export interface ChunkStats {
  readonly rowCount: number;
  readonly nullCount: number;
  readonly min: Scalar;
  readonly max: Scalar;
  /** Exact distinct count for dictionary columns, else an estimate. */
  readonly distinctCount: number;
  readonly encodedBytes: number;
  readonly encoding: Encoding;
}

/** Options for table construction. */
export interface ColumnarTableOptions {
  /** Rows per row-group chunk. Default 8192. */
  readonly chunkSize?: number;
  /**
   * Ratio of runs to rows below which RLE is preferred. Default 0.5.
   * runs / rows < threshold  →  RLE wins.
   */
  readonly rleRunRatio?: number;
  /**
   * Ratio of distinct values to rows below which dictionary encoding is
   * preferred. Default 0.6.
   */
  readonly dictCardinalityRatio?: number;
}

/* ------------------------------------------------------------------------ */
/* BitVector — bit-packed null bitmap                                       */
/* ------------------------------------------------------------------------ */

/**
 * Bit-packed growable bitmap.
 *
 * Stores one bit per logical row → 8× memory saving vs. a boolean[] and
 * 32× vs. a number[]. Used for SQL NULL tracking: a set bit means NULL.
 */
export class BitVector {
  private _words: Uint32Array;
  private _length: number;

  constructor(capacityBits = 64) {
    this._words = new Uint32Array(Math.max(1, Math.ceil(capacityBits / 32)));
    this._length = 0;
  }

  /** Number of logical bits appended so far. */
  get length(): number {
    return this._length;
  }

  /** Number of 32-bit words actually allocated. */
  get wordCount(): number {
    return Math.ceil(this._length / 32);
  }

  /** Byte size of the packed representation. */
  get byteSize(): number {
    return this.wordCount * 4;
  }

  /** Append a bit. Amortized O(1). */
  push(bit: boolean): void {
    if (this._length === this._words.length * 32) {
      const next = new Uint32Array(this._words.length * 2);
      next.set(this._words);
      this._words = next;
    }
    if (bit) {
      this._words[this._length >>> 5] |= 1 << (this._length & 31);
    }
    this._length++;
  }

  /** Test the bit at index. O(1). */
  get(index: number): boolean {
    if (index < 0 || index >= this._length) {
      throw new RangeError(`BitVector index ${index} out of bounds (${this._length})`);
    }
    return (this._words[index >>> 5] & (1 << (index & 31))) !== 0;
  }

  /** Count of set bits — popcount over the used words. O(words). */
  popcount(): number {
    let count = 0;
    const words = this.wordCount;
    for (let w = 0; w < words; w++) {
      let v = this._words[w];
      // Kernighan's popcount loop.
      while (v !== 0) {
        v &= v - 1;
        count++;
      }
    }
    return count;
  }

  /** Serialize to a plain number array (the used words only). */
  toWords(): number[] {
    return Array.from(this._words.subarray(0, this.wordCount));
  }

  /** Rebuild from serialized words. */
  static fromWords(words: readonly number[], length: number): BitVector {
    const bv = new BitVector(Math.max(64, words.length * 32));
    for (let i = 0; i < words.length; i++) {
      bv._words[i] = words[i] >>> 0;
    }
    bv._length = length;
    return bv;
  }
}

/* ------------------------------------------------------------------------ */
/* Encoded column payloads                                                  */
/* ------------------------------------------------------------------------ */

/** Plain encoding: the raw values verbatim. */
interface PlainChunk {
  kind: 'plain';
  values: Scalar[];
}

/** Dictionary encoding: codes[i] indexes into dictionary[]. */
interface DictionaryChunk {
  kind: 'dictionary';
  dictionary: Scalar[];
  codes: number[];
}

/** RLE encoding: runs of (value, repeatCount). */
interface RleChunk {
  kind: 'rle';
  runs: Array<{ value: Scalar; count: number }>;
}

/** Dictionary + RLE: runs of (dictionaryCode, repeatCount). */
interface DictionaryRleChunk {
  kind: 'dictionary-rle';
  dictionary: Scalar[];
  runs: Array<{ code: number; count: number }>;
}

type EncodedChunkData = PlainChunk | DictionaryChunk | RleChunk | DictionaryRleChunk;

/**
 * A single encoded column inside a row-group chunk, plus its null bitmap
 * and zone-map statistics.
 */
export class EncodedColumnChunk {
  readonly column: ColumnSchema;
  readonly nullBitmap: BitVector;
  readonly stats: ChunkStats;
  private readonly _data: EncodedChunkData;

  constructor(column: ColumnSchema, nullBitmap: BitVector, data: EncodedChunkData, stats: ChunkStats) {
    this.column = column;
    this.nullBitmap = nullBitmap;
    this.stats = stats;
    this._data = data;
  }

  /**
   * Decode the full column to materialized values.
   * O(rowCount) — one pass over codes/runs.
   */
  decode(): Scalar[] {
    const out: Scalar[] = new Array(this.stats.rowCount);
    let i = 0;
    switch (this._data.kind) {
      case 'plain':
        for (let j = 0; j < this._data.values.length; j++) out[i++] = this._data.values[j];
        break;
      case 'dictionary':
        for (let j = 0; j < this._data.codes.length; j++) {
          out[i++] = this._data.dictionary[this._data.codes[j]];
        }
        break;
      case 'rle':
        for (const run of this._data.runs) {
          for (let k = 0; k < run.count; k++) out[i++] = run.value;
        }
        break;
      case 'dictionary-rle':
        for (const run of this._data.runs) {
          const v = this._data.dictionary[run.code];
          for (let k = 0; k < run.count; k++) out[i++] = v;
        }
        break;
    }
    // Re-apply NULLs: encoded values at null positions are placeholders.
    for (let r = 0; r < this.stats.rowCount; r++) {
      if (this.nullBitmap.get(r)) out[r] = null;
    }
    return out;
  }

  /**
   * Decode a single row without materializing the column. O(1) for
   * plain/dictionary; O(runs) worst-case for RLE (run lengths are walked
   * cumulatively — could be binary searched, kept linear for simplicity).
   */
  decodeAt(rowIndex: number): Scalar {
    if (this.nullBitmap.get(rowIndex)) return null;
    switch (this._data.kind) {
      case 'plain':
        return this._data.values[rowIndex];
      case 'dictionary':
        return this._data.dictionary[this._data.codes[rowIndex]];
      case 'rle': {
        let acc = 0;
        for (const run of this._data.runs) {
          acc += run.count;
          if (rowIndex < acc) return run.value;
        }
        break;
      }
      case 'dictionary-rle': {
        let acc = 0;
        for (const run of this._data.runs) {
          acc += run.count;
          if (rowIndex < acc) return this._data.dictionary[run.code];
        }
        break;
      }
    }
    throw new RangeError(`rowIndex ${rowIndex} out of bounds`);
  }

  /**
   * Zone-map test: can this chunk possibly contain a row matching `pred`?
   * Conservative — only returns `false` when the predicate is provably
   * unsatisfiable from min/max/null statistics alone.
   */
  mightMatch(pred: ColumnPredicate): boolean {
    const { min, max, nullCount, rowCount } = this.stats;
    switch (pred.op) {
      case 'isNull':
        return nullCount > 0;
      case 'notNull':
        return nullCount < rowCount;
      case 'eq':
      case 'in': {
        const vals = pred.op === 'in' ? (pred.value as readonly Scalar[]) : [pred.value as Scalar];
        return vals.some((v) => this._withinZone(v));
      }
      case 'neq': {
        // Only prunable when every non-null value equals the predicate value
        // or there are no non-null values at all.
        const v = pred.value as Scalar;
        if (rowCount - nullCount === 0) return true; // all nulls satisfy neq(nonNull)
        if (v === null) return nullCount < rowCount;
        return !(min === v && max === v && nullCount === 0);
      }
      case 'lt':
      case 'lte': {
        if (min === null || min === undefined) return false;
        const c = compareScalars(min, pred.value as Scalar);
        return pred.op === 'lt' ? c < 0 : c <= 0;
      }
      case 'gt':
      case 'gte': {
        if (max === null || max === undefined) return false;
        const c = compareScalars(max, pred.value as Scalar);
        return pred.op === 'gt' ? c > 0 : c >= 0;
      }
      default:
        return true;
    }
  }

  private _withinZone(v: Scalar): boolean {
    if (v === null) return this.stats.nullCount > 0;
    const { min, max } = this.stats;
    if (min === null || max === null) return false;
    return compareScalars(v, min) >= 0 && compareScalars(v, max) <= 0;
  }
}

/** Total ordering used across min/max tracking and predicate evaluation. */
export function compareScalars(a: Scalar, b: Scalar): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/* ------------------------------------------------------------------------ */
/* Row group                                                                */
/* ------------------------------------------------------------------------ */

/** One horizontal slice of the table: `rowCount` rows across all columns. */
export class RowGroup {
  readonly index: number;
  readonly rowCount: number;
  private readonly _columns: Map<string, EncodedColumnChunk>;

  constructor(index: number, rowCount: number, columns: Map<string, EncodedColumnChunk>) {
    this.index = index;
    this.rowCount = rowCount;
    this._columns = columns;
  }

  getColumn(name: string): EncodedColumnChunk | undefined {
    return this._columns.get(name);
  }

  columnNames(): string[] {
    return [...this._columns.keys()];
  }
}

/* ------------------------------------------------------------------------ */
/* Column builder (write path)                                              */
/* ------------------------------------------------------------------------ */

/**
 * Accumulates raw values for one column inside one row group, then encodes
 * them with the best physical encoding.
 *
 * Encoding selection heuristic (per chunk):
 *  1. If runs/rows < rleRunRatio and distinct/rows < dictCardinalityRatio
 *     → `dictionary-rle` (best of both worlds).
 *  2. Else if runs/rows < rleRunRatio → `rle`.
 *  3. Else if distinct/rows < dictCardinalityRatio → `dictionary`.
 *  4. Else → `plain`.
 */
class ColumnChunkBuilder {
  private readonly _column: ColumnSchema;
  private readonly _values: Scalar[] = [];
  private readonly _nulls: BitVector;

  constructor(column: ColumnSchema, capacity: number) {
    this._column = column;
    this._nulls = new BitVector(capacity);
  }

  push(value: Scalar): void {
    if (value === null || value === undefined) {
      if (!this._column.nullable) {
        throw new Error(`Column '${this._column.name}' is NOT NULL`);
      }
      this._nulls.push(true);
      this._values.push(null);
      return;
    }
    if (!isTypeCompatible(this._column.type, value)) {
      throw new TypeError(
        `Value ${JSON.stringify(value)} incompatible with column '${this._column.name}' (${this._column.type})`
      );
    }
    this._nulls.push(false);
    this._values.push(value);
  }

  get size(): number {
    return this._values.length;
  }

  /** Encode with the chosen strategy and produce an immutable chunk. */
  build(opts: Required<ColumnarTableOptions>): EncodedColumnChunk {
    const values = this._values;
    const n = values.length;
    let runs = 0;
    const distinct = new Set<Scalar>();
    let min: Scalar = null;
    let max: Scalar = null;
    let nullCount = 0;

    // Single pass: count runs, distinct values, min/max — O(n).
    for (let i = 0; i < n; i++) {
      if (i === 0 || values[i] !== values[i - 1]) runs++;
      const v = values[i];
      if (v === null) {
        nullCount++;
        continue;
      }
      distinct.add(v);
      if (min === null || compareScalars(v, min) < 0) min = v;
      if (max === null || compareScalars(v, max) > 0) max = v;
    }

    const runRatio = n === 0 ? 1 : runs / n;
    const cardRatio = n === 0 ? 1 : distinct.size / n;
    const preferRle = runRatio < opts.rleRunRatio && runs > 0;
    const preferDict = cardRatio < opts.dictCardinalityRatio && distinct.size > 0;

    let data: EncodedChunkData;
    let encoding: Encoding;
    if (preferRle && preferDict) {
      data = buildDictionaryRle(values, this._nulls);
      encoding = 'dictionary-rle';
    } else if (preferRle) {
      data = buildRle(values, this._nulls);
      encoding = 'rle';
    } else if (preferDict) {
      data = buildDictionary(values, this._nulls);
      encoding = 'dictionary';
    } else {
      data = { kind: 'plain', values: values.slice() };
      encoding = 'plain';
    }

    const stats: ChunkStats = {
      rowCount: n,
      nullCount,
      min,
      max,
      distinctCount: distinct.size,
      encodedBytes: estimateEncodedBytes(data),
      encoding,
    };
    return new EncodedColumnChunk(this._column, this._nulls, data, stats);
  }
}

function isTypeCompatible(type: ColumnType, v: Scalar): boolean {
  switch (type) {
    case 'int32':
      return typeof v === 'number' && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
    case 'int64':
      return typeof v === 'number' && Number.isInteger(v);
    case 'float64':
      return typeof v === 'number';
    case 'boolean':
      return typeof v === 'boolean';
    case 'string':
    case 'date':
      return typeof v === 'string' || typeof v === 'number';
    default:
      return false;
  }
}

function buildDictionary(values: readonly Scalar[], nulls: BitVector): DictionaryChunk {
  const dict: Scalar[] = [];
  const index = new Map<Scalar, number>();
  const codes = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    // NULLs share a dictionary slot but are masked by the bitmap on decode.
    const v = nulls.get(i) ? null : values[i];
    let code = index.get(v);
    if (code === undefined) {
      code = dict.length;
      dict.push(v);
      index.set(v, code);
    }
    codes[i] = code;
  }
  return { kind: 'dictionary', dictionary: dict, codes };
}

function buildRle(values: readonly Scalar[], nulls: BitVector): RleChunk {
  const runs: Array<{ value: Scalar; count: number }> = [];
  for (let i = 0; i < values.length; i++) {
    const v = nulls.get(i) ? null : values[i];
    const last = runs[runs.length - 1];
    if (last !== undefined && last.value === v) {
      last.count++;
    } else {
      runs.push({ value: v, count: 1 });
    }
  }
  return { kind: 'rle', runs };
}

function buildDictionaryRle(values: readonly Scalar[], nulls: BitVector): DictionaryRleChunk {
  const dict: Scalar[] = [];
  const index = new Map<Scalar, number>();
  const runs: Array<{ code: number; count: number }> = [];
  for (let i = 0; i < values.length; i++) {
    const v = nulls.get(i) ? null : values[i];
    let code = index.get(v);
    if (code === undefined) {
      code = dict.length;
      dict.push(v);
      index.set(v, code);
    }
    const last = runs[runs.length - 1];
    if (last !== undefined && last.code === code) {
      last.count++;
    } else {
      runs.push({ code, count: 1 });
    }
  }
  return { kind: 'dictionary-rle', dictionary: dict, runs };
}

/** Rough byte-size estimate for an encoded payload (for stats/pruning). */
function estimateEncodedBytes(data: EncodedChunkData): number {
  const scalarSize = (v: Scalar): number => {
    if (v === null) return 1;
    if (typeof v === 'number') return 8;
    if (typeof v === 'boolean') return 1;
    return v.length;
  };
  let total = 0;
  switch (data.kind) {
    case 'plain':
      for (const v of data.values) total += scalarSize(v);
      return total;
    case 'dictionary':
      for (const v of data.dictionary) total += scalarSize(v);
      return total + data.codes.length * 4;
    case 'rle':
      for (const r of data.runs) total += scalarSize(r.value) + 4;
      return total;
    case 'dictionary-rle':
      for (const v of data.dictionary) total += scalarSize(v);
      return total + data.runs.length * 8;
  }
}

/* ------------------------------------------------------------------------ */
/* Table                                                                    */
/* ------------------------------------------------------------------------ */

/** Materialized row: column name → value. */
export type Row = Record<string, Scalar>;

/** Result of a scan: matching row ids and (optionally) projected values. */
export interface ScanResult {
  /** Global row indexes that matched every predicate. */
  readonly rowIds: number[];
  /** Materialized projected rows (same order as rowIds). */
  readonly rows: Row[];
  /** Number of row groups skipped by zone-map pruning. */
  readonly chunksPruned: number;
  /** Number of row groups actually scanned. */
  readonly chunksScanned: number;
}

/**
 * Columnar table: schema + list of encoded row groups.
 *
 * Write path: rows are appended into an open row group until `chunkSize`
 * is reached, at which point the group is flushed — each column is encoded
 * independently and becomes immutable. Scans evaluate predicates with
 * zone-map pruning first, then decode only surviving chunks.
 */
export class ColumnarTable {
  readonly name: string;
  readonly schema: readonly ColumnSchema[];
  private readonly _options: Required<ColumnarTableOptions>;
  private readonly _rowGroups: RowGroup[] = [];
  private _builders: ColumnChunkBuilder[] | null = null;
  private _openRowCount = 0;
  private _totalRows = 0;
  private _sealed = false;

  constructor(name: string, schema: readonly ColumnSchema[], options: ColumnarTableOptions = {}) {
    if (schema.length === 0) throw new Error('Table needs at least one column');
    const names = new Set(schema.map((c) => c.name));
    if (names.size !== schema.length) throw new Error('Duplicate column names');
    this.name = name;
    this.schema = schema;
    this._options = {
      chunkSize: options.chunkSize ?? 8192,
      rleRunRatio: options.rleRunRatio ?? 0.5,
      dictCardinalityRatio: options.dictCardinalityRatio ?? 0.6,
    };
  }

  get rowCount(): number {
    return this._totalRows;
  }

  get rowGroupCount(): number {
    return this._rowGroups.length;
  }

  get rowGroups(): readonly RowGroup[] {
    return this._rowGroups;
  }

  private _columnIndex(name: string): number {
    const i = this.schema.findIndex((c) => c.name === name);
    if (i < 0) throw new Error(`Unknown column '${name}' in table '${this.name}'`);
    return i;
  }

  /**
   * Append one row. Column order follows the schema; missing keys → NULL.
   * O(#columns).
   */
  appendRow(row: Row): void {
    if (this._sealed) throw new Error('Table is sealed');
    if (this._builders === null) {
      this._builders = this.schema.map((c) => new ColumnChunkBuilder(c, this._options.chunkSize));
      this._openRowCount = 0;
    }
    for (let i = 0; i < this.schema.length; i++) {
      const col = this.schema[i];
      const v = row[col.name];
      this._builders[i].push(v === undefined ? null : v);
    }
    this._openRowCount++;
    this._totalRows++;
    if (this._openRowCount === this._options.chunkSize) {
      this._flushOpen();
    }
  }

  /** Append a batch of rows. */
  appendBatch(rows: readonly Row[]): void {
    for (const r of rows) this.appendRow(r);
  }

  private _flushOpen(): void {
    if (this._builders === null || this._openRowCount === 0) return;
    const cols = new Map<string, EncodedColumnChunk>();
    for (let i = 0; i < this.schema.length; i++) {
      const chunk = this._builders[i].build(this._options);
      cols.set(this.schema[i].name, chunk);
    }
    this._rowGroups.push(new RowGroup(this._rowGroups.length, this._openRowCount, cols));
    this._builders = null;
    this._openRowCount = 0;
  }

  /** Flush any partial row group and freeze the write path. */
  seal(): void {
    this._flushOpen();
    this._sealed = true;
  }

  /**
   * Scan with predicate pushdown.
   *
   * 1. Zone-map pruning: a row group is skipped when any predicate's
   *    column stats prove it cannot contain matches.
   * 2. Surviving chunks are decoded once per column referenced by the
   *    predicates or projection (lazy decode — unreferenced columns are
   *    never touched).
   *
   * Worst case O(rows × referencedColumns); best case O(chunks) when all
   * groups are pruned.
   */
  scan(predicates: readonly ColumnPredicate[] = [], projection?: readonly string[]): ScanResult {
    this._flushOpen(); // make partial group visible
    const proj = projection ?? this.schema.map((c) => c.name);
    for (const p of predicates) this._columnIndex(p.column); // validates
    for (const p of proj) this._columnIndex(p);

    const rowIds: number[] = [];
    const rows: Row[] = [];
    let pruned = 0;
    let scanned = 0;
    let baseOffset = 0;

    for (const group of this._rowGroups) {
      let possible = true;
      for (const pred of predicates) {
        const chunk = group.getColumn(pred.column);
        if (chunk !== undefined && !chunk.mightMatch(pred)) {
          possible = false;
          break;
        }
      }
      if (!possible) {
        pruned++;
        baseOffset += group.rowCount;
        continue;
      }
      scanned++;

      // Decode exactly the columns needed.
      const needed = new Set<string>([...predicates.map((p) => p.column), ...proj]);
      const decoded = new Map<string, Scalar[]>();
      for (const name of needed) {
        const chunk = group.getColumn(name);
        if (chunk !== undefined) decoded.set(name, chunk.decode());
      }

      for (let r = 0; r < group.rowCount; r++) {
        let match = true;
        for (const pred of predicates) {
          const colVals = decoded.get(pred.column);
          if (colVals === undefined || !evalPredicate(pred, colVals[r])) {
            match = false;
            break;
          }
        }
        if (match) {
          rowIds.push(baseOffset + r);
          const row: Row = {};
          for (const name of proj) {
            const vals = decoded.get(name);
            row[name] = vals === undefined ? null : vals[r];
          }
          rows.push(row);
        }
      }
      baseOffset += group.rowCount;
    }

    return { rowIds, rows, chunksPruned: pruned, chunksScanned: scanned };
  }

  /** Fetch a single row by global id. O(1) group lookup + column decode-at. */
  rowAt(rowId: number, projection?: readonly string[]): Row {
    this._flushOpen();
    const proj = projection ?? this.schema.map((c) => c.name);
    let offset = 0;
    for (const group of this._rowGroups) {
      if (rowId < offset + group.rowCount) {
        const local = rowId - offset;
        const out: Row = {};
        for (const name of proj) {
          const chunk = group.getColumn(name);
          out[name] = chunk === undefined ? null : chunk.decodeAt(local);
        }
        return out;
      }
      offset += group.rowCount;
    }
    throw new RangeError(`rowId ${rowId} out of bounds (${this._totalRows})`);
  }

  /** Total encoded size across all chunks (bytes, estimated). */
  encodedSizeBytes(): number {
    this._flushOpen();
    let total = 0;
    for (const g of this._rowGroups) {
      for (const name of g.columnNames()) {
        const chunk = g.getColumn(name);
        if (chunk !== undefined) total += chunk.stats.encodedBytes + chunk.nullBitmap.byteSize;
      }
    }
    return total;
  }

  /** Zone-map statistics for every chunk of a column (partition pruning). */
  chunkStats(column: string): ChunkStats[] {
    this._flushOpen();
    this._columnIndex(column);
    const out: ChunkStats[] = [];
    for (const g of this._rowGroups) {
      const c = g.getColumn(column);
      if (c !== undefined) out.push(c.stats);
    }
    return out;
  }
}

/** Evaluate a predicate against a single decoded cell value. */
export function evalPredicate(pred: ColumnPredicate, cell: Scalar): boolean {
  switch (pred.op) {
    case 'isNull':
      return cell === null;
    case 'notNull':
      return cell !== null;
    case 'eq':
      return cell === pred.value;
    case 'neq':
      return cell !== null && cell !== pred.value;
    case 'in': {
      const vals = pred.value as readonly Scalar[];
      return vals.some((v) => v === cell);
    }
    case 'lt':
      return cell !== null && compareScalars(cell, pred.value as Scalar) < 0;
    case 'lte':
      return cell !== null && compareScalars(cell, pred.value as Scalar) <= 0;
    case 'gt':
      return cell !== null && compareScalars(cell, pred.value as Scalar) > 0;
    case 'gte':
      return cell !== null && compareScalars(cell, pred.value as Scalar) >= 0;
    default:
      return true;
  }
}
