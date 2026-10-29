/**
 * Parquet-like Columnar File Format (reference implementation)
 *
 * A simplified binary columnar format written to/from Uint8Array:
 *
 *   [magic 'LK01'][headerLen u32][header JSON][row group data...]
 *
 * The header contains schema + per-column-chunk offsets, byte lengths and
 * zone-map stats (min/max/nulls) — exactly the metadata Parquet keeps in
 * its footer to enable projection pushdown and chunk skipping.
 *
 * Encodings per column chunk: PLAIN (typed arrays / varint strings) and
 * DICTIONARY+RLE hybrid for low-cardinality strings. Boolean columns are
 * bit-packed. All multi-byte integers are little-endian.
 *
 * @module DataLake/Engine
 */

/** Logical column types supported by the file format. */
export type LakeColumnType = 'int32' | 'int64' | 'float64' | 'boolean' | 'utf8';

export interface LakeColumnSchema {
  readonly name: string;
  readonly type: LakeColumnType;
  readonly nullable: boolean;
}

export type LakeScalar = string | number | boolean | null;

export type LakeRow = Record<string, LakeScalar>;

/** Zone-map stats per column chunk. */
export interface ColumnChunkMeta {
  readonly column: string;
  readonly encoding: 'plain' | 'dict-rle' | 'bitpack';
  readonly offset: number;
  readonly length: number;
  readonly rowCount: number;
  readonly nullCount: number;
  readonly min: LakeScalar;
  readonly max: LakeScalar;
}

interface RowGroupMeta {
  readonly rowCount: number;
  readonly columns: ColumnChunkMeta[];
}

interface FileHeader {
  readonly version: 1;
  readonly schema: LakeColumnSchema[];
  readonly rowGroups: RowGroupMeta[];
}

const MAGIC = new Uint8Array([0x4c, 0x4b, 0x30, 0x31]); // 'LK01'

/* ------------------------------------------------------------------------ */
/* Writer                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Builds a columnar file row-group by row-group.
 *
 * Usage:
 *   const w = new ColumnarFileWriter(schema, { rowGroupSize: 1000 });
 *   w.writeRow({...});  w.writeRows([...]);
 *   const bytes = w.finish();
 */
export class ColumnarFileWriter {
  private readonly _schema: readonly LakeColumnSchema[];
  private readonly _rowGroupSize: number;
  private readonly _groups: RowGroupMeta[] = [];
  private readonly _chunks: Uint8Array[] = [];
  private _pending: LakeRow[] = [];

  constructor(schema: readonly LakeColumnSchema[], opts: { rowGroupSize?: number } = {}) {
    if (schema.length === 0) throw new Error('schema must not be empty');
    this._schema = schema;
    this._rowGroupSize = opts.rowGroupSize ?? 8192;
  }

  writeRow(row: LakeRow): void {
    this._pending.push(row);
    if (this._pending.length >= this._rowGroupSize) this._flushGroup();
  }

  writeRows(rows: readonly LakeRow[]): void {
    for (const r of rows) this.writeRow(r);
  }

  /** Flush pending rows as a partial row group and produce the file bytes. */
  finish(): Uint8Array {
    this._flushGroup();
    const header: FileHeader = { version: 1, schema: [...this._schema], rowGroups: this._groups };
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const total = MAGIC.length + 4 + headerBytes.length + this._chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    out.set(MAGIC, off); off += MAGIC.length;
    new DataView(out.buffer).setUint32(off, headerBytes.length, true); off += 4;
    out.set(headerBytes, off); off += headerBytes.length;
    for (const c of this._chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  private _flushGroup(): void {
    if (this._pending.length === 0) return;
    const rows = this._pending;
    this._pending = [];
    const meta: ColumnChunkMeta[] = [];
    for (const col of this._schema) {
      const values = rows.map((r) => {
        const v = r[col.name];
        return v === undefined ? null : v;
      });
      const { bytes, encoding } = encodeColumn(col, values);
      // offset is relative to start of chunk region; resolved by reader
      // via cumulative sum — same trick IPC formats use.
      meta.push({
        column: col.name,
        encoding,
        offset: 0,
        length: bytes.length,
        rowCount: values.length,
        nullCount: values.filter((v) => v === null).length,
        min: minOf(values),
        max: maxOf(values),
      });
      this._chunks.push(bytes);
    }
    this._groups.push({ rowCount: rows.length, columns: meta });
  }
}

function minOf(values: readonly LakeScalar[]): LakeScalar {
  let m: LakeScalar = null;
  for (const v of values) if (v !== null && (m === null || v < m)) m = v;
  return m;
}
function maxOf(values: readonly LakeScalar[]): LakeScalar {
  let m: LakeScalar = null;
  for (const v of values) if (v !== null && (m === null || v > m)) m = v;
  return m;
}

/* ------------------------------------------------------------------------ */
/* Column encoders                                                          */
/* ------------------------------------------------------------------------ */

interface EncodedColumn {
  bytes: Uint8Array;
  encoding: 'plain' | 'dict-rle' | 'bitpack';
}

/**
 * Pick encoding per column chunk:
 *  - boolean → bitpack (1 bit/row + null bitmap)
 *  - utf8 with ≤ 25% cardinality → dict-rle
 *  - otherwise → plain typed encoding
 */
function encodeColumn(col: LakeColumnSchema, values: LakeScalar[]): EncodedColumn {
  const nulls = encodeNullBitmap(values);
  switch (col.type) {
    case 'boolean':
      return { bytes: concat([nulls, bitpackBooleans(values)]), encoding: 'bitpack' };
    case 'utf8': {
      const distinct = new Set(values.filter((v) => v !== null));
      if (distinct.size > 0 && distinct.size <= values.length * 0.25) {
        return { bytes: concat([nulls, encodeDictRleStrings(values)]), encoding: 'dict-rle' };
      }
      return { bytes: concat([nulls, encodePlainStrings(values)]), encoding: 'plain' };
    }
    case 'int32':
      return { bytes: concat([nulls, encodePlainNumbers(values, 4, (dv, o, v) => dv.setInt32(o, v, true))]), encoding: 'plain' };
    case 'int64':
      return { bytes: concat([nulls, encodePlainNumbers(values, 8, (dv, o, v) => dv.setFloat64(o, v, true))]), encoding: 'plain' };
    case 'float64':
      return { bytes: concat([nulls, encodePlainNumbers(values, 8, (dv, o, v) => dv.setFloat64(o, v, true))]), encoding: 'plain' };
  }
}

/** Null bitmap: u32 rowCount + ceil(n/8) bytes, 1 bit per row (set = NULL). */
function encodeNullBitmap(values: readonly LakeScalar[]): Uint8Array {
  const n = values.length;
  const bytes = new Uint8Array(4 + Math.ceil(n / 8));
  new DataView(bytes.buffer).setUint32(0, n, true);
  for (let i = 0; i < n; i++) {
    if (values[i] === null) bytes[4 + (i >>> 3)] |= 1 << (i & 7);
  }
  return bytes;
}

function bitpackBooleans(values: readonly LakeScalar[]): Uint8Array {
  const n = values.length;
  const bytes = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) {
    if (values[i] === true) bytes[i >>> 3] |= 1 << (i & 7);
  }
  return bytes;
}

function encodePlainNumbers(
  values: readonly LakeScalar[],
  width: 4 | 8,
  write: (dv: DataView, offset: number, v: number) => void
): Uint8Array {
  const bytes = new Uint8Array(values.length * width);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    write(dv, i * width, typeof v === 'number' ? v : 0);
  }
  return bytes;
}

function encodePlainStrings(values: readonly LakeScalar[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [new Uint8Array(4)];
  let total = 4;
  for (const v of values) {
    const b = enc.encode(v === null ? '' : String(v));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, b.length, true);
    parts.push(len, b);
    total += 4 + b.length;
  }
  new DataView(parts[0].buffer).setUint32(0, values.length, true);
  return concat(parts, total);
}

/** Dictionary + RLE on dictionary codes: [u32 dictLen][dict strings][u32 runCount][runs(code u32, count u32)] */
function encodeDictRleStrings(values: readonly LakeScalar[]): Uint8Array {
  const dict: string[] = [];
  const index = new Map<string, number>();
  const codes = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const s = v === null ? '' : String(v);
    let code = index.get(s);
    if (code === undefined) {
      code = dict.length;
      dict.push(s);
      index.set(s, code);
    }
    codes[i] = code;
  }
  // RLE on codes
  const runs: Array<{ code: number; count: number }> = [];
  for (const c of codes) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.code === c) last.count++;
    else runs.push({ code: c, count: 1 });
  }
  const enc = new TextEncoder();
  const dictBytes = dict.map((s) => enc.encode(s));
  const dictLen = dictBytes.reduce((a, b) => a + 4 + b.length, 0);
  const out = new Uint8Array(4 + dictLen + 4 + runs.length * 8);
  const dv = new DataView(out.buffer);
  let off = 0;
  dv.setUint32(off, dict.length, true); off += 4;
  for (const b of dictBytes) {
    dv.setUint32(off, b.length, true); off += 4;
    out.set(b, off); off += b.length;
  }
  dv.setUint32(off, runs.length, true); off += 4;
  for (const r of runs) {
    dv.setUint32(off, r.code, true); off += 4;
    dv.setUint32(off, r.count, true); off += 4;
  }
  return out;
}

function concat(parts: readonly Uint8Array[], total?: number): Uint8Array {
  const len = total ?? parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Reader                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Reads files written by ColumnarFileWriter.
 *
 * Supports projection pushdown (only requested columns are decoded) and
 * zone-map pruning (row groups whose min/max prove no match are skipped
 * without decoding their bytes).
 */
export class ColumnarFileReader {
  readonly schema: readonly LakeColumnSchema[];
  private readonly _header: FileHeader;
  private readonly _data: Uint8Array;
  private readonly _chunkBase: number;

  constructor(bytes: Uint8Array) {
    if (bytes.length < 8 || bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2] || bytes[3] !== MAGIC[3]) {
      throw new Error('Not a lake columnar file (bad magic)');
    }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLen = dv.getUint32(4, true);
    const headerJson = new TextDecoder().decode(bytes.subarray(8, 8 + headerLen));
    this._header = JSON.parse(headerJson) as FileHeader;
    this.schema = this._header.schema;
    this._data = bytes;
    this._chunkBase = 8 + headerLen;
    // Resolve cumulative offsets now that we know the chunk ordering.
    let off = this._chunkBase;
    for (const g of this._header.rowGroups) {
      for (const c of g.columns) {
        (c as { offset: number }).offset = off;
        off += c.length;
      }
    }
  }

  get rowCount(): number {
    return this._header.rowGroups.reduce((a, g) => a + g.rowCount, 0);
  }

  get rowGroupCount(): number {
    return this._header.rowGroups.length;
  }

  /** Metadata for pruning decisions. */
  columnStats(groupIndex: number, column: string): ColumnChunkMeta | undefined {
    return this._header.rowGroups[groupIndex]?.columns.find((c) => c.column === column);
  }

  /**
   * Read rows with optional column projection and per-column equality
   * filter evaluated against zone maps first (chunk skip) then decoded.
   */
  read(opts: { columns?: readonly string[]; filter?: { column: string; eq: LakeScalar } } = {}): LakeRow[] {
    const cols = opts.columns ?? this.schema.map((c) => c.name);
    const out: LakeRow[] = [];
    for (const group of this._header.rowGroups) {
      // Zone-map skip
      if (opts.filter !== undefined) {
        const meta = group.columns.find((c) => c.column === opts.filter?.column);
        if (meta !== undefined) {
          const v = opts.filter.eq;
          if (v === null) {
            if (meta.nullCount === 0) continue;
          } else if (meta.min !== null && meta.max !== null && (v < meta.min || v > meta.max)) {
            continue;
          }
        }
      }
      // Decode requested columns + filter column
      const needed = new Set(cols);
      if (opts.filter !== undefined) needed.add(opts.filter.column);
      const decoded = new Map<string, LakeScalar[]>();
      for (const c of group.columns) {
        if (!needed.has(c.column)) continue;
        decoded.set(c.column, decodeColumnChunk(this._data, c));
      }
      for (let i = 0; i < group.rowCount; i++) {
        if (opts.filter !== undefined) {
          const v = decoded.get(opts.filter.column)?.[i];
          if (v !== opts.filter.eq) continue;
        }
        const row: LakeRow = {};
        for (const c of cols) row[c] = decoded.get(c)?.[i] ?? null;
        out.push(row);
      }
    }
    return out;
  }
}

function decodeColumnChunk(data: Uint8Array, meta: ColumnChunkMeta): LakeScalar[] {
  const chunk = data.subarray(meta.offset, meta.offset + meta.length);
  const dv = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const n = dv.getUint32(0, true);
  const nullsLen = 4 + Math.ceil(n / 8);
  const isNull = (i: number): boolean => (chunk[4 + (i >>> 3)] & (1 << (i & 7))) !== 0;
  const body = chunk.subarray(nullsLen);
  let values: LakeScalar[];
  switch (meta.encoding) {
    case 'bitpack': {
      values = new Array(n);
      for (let i = 0; i < n; i++) values[i] = (body[i >>> 3] & (1 << (i & 7))) !== 0;
      break;
    }
    case 'dict-rle':
      values = decodeDictRleStrings(body, n);
      break;
    case 'plain':
      values = decodePlain(body, meta, n);
      break;
  }
  for (let i = 0; i < n; i++) if (isNull(i)) values[i] = null;
  return values;
}

function decodePlain(body: Uint8Array, meta: ColumnChunkMeta, n: number): LakeScalar[] {
  // Column type inferred from encoding context isn't stored per chunk in
  // this simplified format; readers pass schema via meta.column — we
  // disambiguate by trying fixed-width numeric first (int32: 4n bytes,
  // int64/float64: 8n bytes), else strings.
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const out: LakeScalar[] = new Array(n);
  if (body.length === n * 4) {
    for (let i = 0; i < n; i++) out[i] = dv.getInt32(i * 4, true);
    return out;
  }
  if (body.length === n * 8) {
    for (let i = 0; i < n; i++) out[i] = dv.getFloat64(i * 8, true);
    return out;
  }
  // plain strings: u32 count + [u32 len][bytes]*
  const dec = new TextDecoder();
  const count = dv.getUint32(0, true);
  let off = 4;
  for (let i = 0; i < Math.min(count, n); i++) {
    const len = dv.getUint32(off, true); off += 4;
    out[i] = dec.decode(body.subarray(off, off + len)); off += len;
  }
  return out;
}

function decodeDictRleStrings(body: Uint8Array, n: number): LakeScalar[] {
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const dec = new TextDecoder();
  let off = 0;
  const dictLen = dv.getUint32(off, true); off += 4;
  const dict: string[] = [];
  for (let i = 0; i < dictLen; i++) {
    const len = dv.getUint32(off, true); off += 4;
    dict.push(dec.decode(body.subarray(off, off + len))); off += len;
  }
  const runCount = dv.getUint32(off, true); off += 4;
  const out: LakeScalar[] = new Array(n);
  let idx = 0;
  for (let r = 0; r < runCount; r++) {
    const code = dv.getUint32(off, true); off += 4;
    const count = dv.getUint32(off, true); off += 4;
    for (let k = 0; k < count; k++) out[idx++] = dict[code];
  }
  return out;
}
