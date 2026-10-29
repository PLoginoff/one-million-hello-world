/**
 * ETL Operators — Extractors, Transformers, Loaders
 *
 * Extractors
 * ----------
 *  - `batchExtractor` — emit the whole source as one batch.
 *  - `incrementalExtractor` — watermark-based delta extraction: reads a
 *    monotonic column (updated_at, sequence id), emits only rows above
 *    the stored watermark, and writes the new high-water mark into
 *    ctx.watermark (persisted via the engine checkpoint).
 *  - `pagedExtractor` — chunked extraction with cursor pagination.
 *
 * Transformers
 * ------------
 * Composable row-set operators mirroring the relational/streaming
 * vocabulary: map, filter, flatMap, join (hash join — build/probe,
 * O(n+m)), aggregate (hash grouping), window (running aggregates over
 * ordered partitions), union, dedupe (stable first-wins hashing).
 *
 * Loaders
 * -------
 *  - `bulkLoader` — chunked append into a sink interface.
 *  - `upsertLoader` — merge-by-key: existing keys updated, new keys
 *    inserted; keeps a key index in the sink for O(1) probing.
 *
 * @module EtlPipeline/Engine
 */

import { Row, RowBatch, StageContext } from './DagEngine';

/* ------------------------------------------------------------------------ */
/* Extractors                                                               */
/* ------------------------------------------------------------------------ */

/** Any enumerable source of rows. */
export interface RowSource {
  /** Fetch all remaining rows (batch mode). */
  readAll(): Promise<Row[]> | Row[];
  /** Fetch up to `limit` rows after `cursor`; returns next cursor or null. */
  readPage?(cursor: unknown, limit: number): Promise<{ rows: Row[]; nextCursor: unknown | null }>;
}

/** Wrap an array as a RowSource. */
export function arraySource(rows: readonly Row[]): RowSource {
  let offset = 0;
  return {
    readAll: () => rows.slice(offset),
    readPage: (cursor: unknown, limit: number) => {
      const start = typeof cursor === 'number' ? cursor : 0;
      const slice = rows.slice(start, start + limit);
      const next = start + slice.length < rows.length ? start + slice.length : null;
      offset = start + slice.length;
      return Promise.resolve({ rows: slice, nextCursor: next });
    },
  };
}

/** Full extraction: drain the source into one batch. */
export async function batchExtractor(source: RowSource, ctx: StageContext): Promise<RowBatch> {
  const rows = await source.readAll();
  ctx.reportLineage({ from: 'source', to: ctx.stageId, transform: 'full-extract' });
  return { rows, origin: ctx.stageId };
}

/**
 * Incremental extraction with a watermark column.
 *
 * Emits only rows where `row[watermarkColumn] > ctx.watermark`, then
 * advances the watermark to the max seen — the classic high-water-mark
 * CDC pattern. Watermark is stored in ctx so the engine persists it in
 * the checkpoint for the next run.
 */
export async function incrementalExtractor(
  source: RowSource,
  watermarkColumn: string,
  ctx: StageContext
): Promise<RowBatch> {
  const all = await source.readAll();
  const prev = ctx.watermark;
  const isNewer = (v: unknown): boolean => {
    if (prev === undefined || prev === null) return true;
    if (typeof v === 'number' && typeof prev === 'number') return v > prev;
    return String(v) > String(prev);
  };
  const delta = all.filter((r) => isNewer(r[watermarkColumn]));
  let max: unknown = prev;
  for (const r of delta) {
    const v = r[watermarkColumn];
    if (max === undefined || max === null || (typeof v === 'number' && typeof max === 'number' ? v > max : String(v) > String(max))) {
      max = v;
    }
  }
  ctx.watermark = max;
  ctx.reportLineage({ from: `source.${watermarkColumn}`, to: ctx.stageId, transform: `incremental where ${watermarkColumn} > ${JSON.stringify(prev ?? null)}` });
  return { rows: delta, origin: ctx.stageId };
}

/** Paged extraction: follow readPage cursors until exhausted. */
export async function pagedExtractor(source: RowSource, pageSize: number, ctx: StageContext): Promise<RowBatch> {
  if (source.readPage === undefined) throw new Error('Source does not support paging');
  const rows: Row[] = [];
  let cursor: unknown = null;
  let first = true;
  do {
    const page = await source.readPage(first ? null : cursor, pageSize);
    rows.push(...page.rows);
    cursor = page.nextCursor;
    first = false;
  } while (cursor !== null && !ctx.signal.aborted);
  ctx.reportLineage({ from: 'source', to: ctx.stageId, transform: `paged(size=${pageSize})` });
  return { rows, origin: ctx.stageId };
}

/* ------------------------------------------------------------------------ */
/* Transformers — pure row-batch functions                                  */
/* ------------------------------------------------------------------------ */

/** map: transform each row 1:1. */
export function mapRows(batch: RowBatch, fn: (row: Row) => Row, origin: string): RowBatch {
  return { rows: batch.rows.map(fn), origin };
}

/** filter: keep rows matching predicate. */
export function filterRows(batch: RowBatch, pred: (row: Row) => boolean, origin: string): RowBatch {
  return { rows: batch.rows.filter(pred), origin };
}

/** flatMap: each row → 0..n rows. */
export function flatMapRows(batch: RowBatch, fn: (row: Row) => readonly Row[], origin: string): RowBatch {
  const out: Row[] = [];
  for (const r of batch.rows) out.push(...fn(r));
  return { rows: out, origin };
}

/**
 * Equi-join two batches on key expressions.
 *
 * Hash join: build phase O(n) inserts right rows into Map<key, rows[]>,
 * probe phase O(m) lookups per left row — total O(n+m) vs the O(n·m)
 * nested loop. Supports inner/left/right/full semantics.
 */
export function joinBatches(
  left: RowBatch,
  right: RowBatch,
  leftKey: (r: Row) => unknown,
  rightKey: (r: Row) => unknown,
  how: 'inner' | 'left' | 'right' | 'full',
  combine: (l: Row | null, r: Row | null) => Row,
  origin: string
): RowBatch {
  const index = new Map<string, Row[]>();
  const keyOf = (v: unknown): string => JSON.stringify(v ?? null);
  for (const r of right.rows) {
    const k = keyOf(rightKey(r));
    const arr = index.get(k);
    if (arr === undefined) index.set(k, [r]);
    else arr.push(r);
  }
  const matchedRight = new Set<Row>();
  const out: Row[] = [];
  for (const l of left.rows) {
    const k = keyOf(leftKey(l));
    const matches = index.get(k);
    if (matches === undefined || matches.length === 0) {
      if (how === 'left' || how === 'full') out.push(combine(l, null));
      continue;
    }
    for (const r of matches) {
      matchedRight.add(r);
      out.push(combine(l, r));
    }
  }
  if (how === 'right' || how === 'full') {
    for (const r of right.rows) {
      if (!matchedRight.has(r)) out.push(combine(null, r));
    }
  }
  return { rows: out, origin };
}

/**
 * Hash aggregation: group rows by key expression, fold each group with
 * the reducer. O(n).
 */
export function aggregateRows<A>(
  batch: RowBatch,
  key: (r: Row) => unknown,
  init: () => A,
  fold: (acc: A, row: Row) => void,
  emit: (key: unknown, acc: A) => Row,
  origin: string
): RowBatch {
  const groups = new Map<string, { key: unknown; acc: A }>();
  for (const r of batch.rows) {
    const k = key(r);
    const ks = JSON.stringify(k ?? null);
    let g = groups.get(ks);
    if (g === undefined) {
      g = { key: k, acc: init() };
      groups.set(ks, g);
    }
    fold(g.acc, r);
  }
  const out: Row[] = [];
  for (const g of groups.values()) out.push(emit(g.key, g.acc));
  return { rows: out, origin };
}

/**
 * Windowed running aggregate over an ordered batch.
 *
 * For each row i, folds rows in frame [i-frameBefore, i+frameAfter] of
 * the sorted batch (sorted by `orderBy`). O(n·w) worst-case; linear for
 * cumulative frames (frameBefore = Infinity).
 */
export function windowRows<A>(
  batch: RowBatch,
  partitionBy: (r: Row) => unknown,
  orderBy: (a: Row, b: Row) => number,
  frameBefore: number,
  frameAfter: number,
  init: () => A,
  fold: (acc: A, row: Row) => void,
  emit: (row: Row, acc: A) => Row,
  origin: string
): RowBatch {
  const partitions = new Map<string, Row[]>();
  for (const r of batch.rows) {
    const k = JSON.stringify(partitionBy(r) ?? null);
    const arr = partitions.get(k);
    if (arr === undefined) partitions.set(k, [r]);
    else arr.push(r);
  }
  const out: Row[] = [];
  for (const part of partitions.values()) {
    const sorted = part.slice().sort(orderBy);
    for (let i = 0; i < sorted.length; i++) {
      const lo = frameBefore === Infinity ? 0 : Math.max(0, i - frameBefore);
      const hi = frameAfter === Infinity ? sorted.length - 1 : Math.min(sorted.length - 1, i + frameAfter);
      const acc = init();
      for (let j = lo; j <= hi; j++) fold(acc, sorted[j]);
      out.push(emit(sorted[i], acc));
    }
  }
  return { rows: out, origin };
}

/** union: concat batches (dedupe available via dedupeRows). */
export function unionRows(batches: readonly RowBatch[], origin: string): RowBatch {
  const out: Row[] = [];
  for (const b of batches) out.push(...b.rows);
  return { rows: out, origin };
}

/** dedupe: first-wins on key hash. O(n). */
export function dedupeRows(batch: RowBatch, key: (r: Row) => unknown, origin: string): RowBatch {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of batch.rows) {
    const k = JSON.stringify(key(r) ?? null);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return { rows: out, origin };
}

/* ------------------------------------------------------------------------ */
/* Loaders                                                                  */
/* ------------------------------------------------------------------------ */

/** Sink abstraction — anything that can take rows. */
export interface RowSink {
  /** Append rows; return rows written. */
  write(rows: readonly Row[]): Promise<number> | number;
  /** Lookup by key (upsert support). */
  getByKey?(key: unknown): Row | undefined;
  /** Update an existing keyed row. */
  updateByKey?(key: unknown, row: Row): Promise<void> | void;
  /** Insert a new keyed row. */
  insertByKey?(key: unknown, row: Row): Promise<void> | void;
}

/** Simple in-memory sink for tests/dev. */
export class MemorySink implements RowSink {
  readonly rows: Row[] = [];
  private readonly _keyIndex = new Map<string, number>();
  private readonly _keyFn: ((r: Row) => unknown) | null;

  constructor(keyFn?: (r: Row) => unknown) {
    this._keyFn = keyFn ?? null;
  }

  write(rows: readonly Row[]): number {
    for (const r of rows) {
      if (this._keyFn !== null) {
        this._keyIndex.set(JSON.stringify(this._keyFn(r) ?? null), this.rows.length);
      }
      this.rows.push(r);
    }
    return rows.length;
  }

  getByKey(key: unknown): Row | undefined {
    const i = this._keyIndex.get(JSON.stringify(key ?? null));
    return i === undefined ? undefined : this.rows[i];
  }

  updateByKey(key: unknown, row: Row): void {
    const i = this._keyIndex.get(JSON.stringify(key ?? null));
    if (i !== undefined) this.rows[i] = row;
  }

  insertByKey(key: unknown, row: Row): void {
    this._keyIndex.set(JSON.stringify(key ?? null), this.rows.length);
    this.rows.push(row);
  }
}

/** Bulk insert: chunk the batch and write each chunk in order. */
export async function bulkLoader(batch: RowBatch, sink: RowSink, chunkSize = 500): Promise<{ written: number }> {
  let written = 0;
  for (let i = 0; i < batch.rows.length; i += chunkSize) {
    written += await sink.write(batch.rows.slice(i, i + chunkSize));
  }
  return { written };
}

/**
 * Upsert loader: merge by key — probe `getByKey`; update on hit,
 * insert on miss. O(n) key lookups when the sink indexes by key.
 */
export async function upsertLoader(
  batch: RowBatch,
  sink: RowSink,
  keyFn: (r: Row) => unknown
): Promise<{ inserted: number; updated: number }> {
  if (sink.getByKey === undefined || sink.updateByKey === undefined || sink.insertByKey === undefined) {
    throw new Error('Sink does not support upsert (needs getByKey/updateByKey/insertByKey)');
  }
  let inserted = 0;
  let updated = 0;
  for (const r of batch.rows) {
    const k = keyFn(r);
    if (sink.getByKey(k) === undefined) {
      await sink.insertByKey(k, r);
      inserted++;
    } else {
      await sink.updateByKey(k, r);
      updated++;
    }
  }
  return { inserted, updated };
}
