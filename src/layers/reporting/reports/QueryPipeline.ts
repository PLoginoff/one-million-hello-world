/**
 * Query Pipeline
 *
 * Executes a {@link ReportQuery} over an in-memory dataset:
 *
 *   rows → filter (WHERE) → group (GROUP BY) → aggregate (SELECT f(x))
 *        → order (ORDER BY) → limit
 *
 * Plus helpers: time-series bucketing and incremental watermarks. The
 * pipeline is pure — the same query + rows always yields the same result,
 * so scheduled reports and incremental snapshots are deterministic.
 *
 * @module ReportingLayer/Reports
 */

import {
  Aggregate,
  BucketSize,
  Cell,
  Clock,
  Dataset,
  Filter,
  ReportError,
  ReportQuery,
  ReportResult,
  Row,
  SystemClock,
} from './ReportTypes';
import { DatasetStore } from './DatasetStore';

export class QueryPipeline {
  constructor(
    private readonly _store: DatasetStore,
    private readonly _clock: Clock = new SystemClock()
  ) {}

  /**
   * Run a query end-to-end (no pivot — see {@link PivotTable}).
   */
  run(query: ReportQuery, watermark?: Cell): ReportResult {
    const ds = this._store.getOrThrow(query.dataset);
    let rows = ds.rows as readonly Row[];

    if (watermark !== undefined && query.incrementalColumn) {
      rows = rows.filter((r) => compareCells(r[query.incrementalColumn!], watermark) > 0);
    }
    if (query.filters) {
      for (const f of query.filters) rows = applyFilter(rows, f);
    }

    let columns: string[];
    let out: Row[];

    if (query.groupBy && query.groupBy.length > 0) {
      const grouped = groupRows(rows, query.groupBy);
      const aggs = query.aggregates ?? [];
      columns = [...query.groupBy, ...aggs.map((a) => a.as)];
      out = [];
      for (const [key, groupRowsList] of grouped) {
        const row: Record<string, Cell> = {};
        const keyParts = key.split('');
        query.groupBy.forEach((g, i) => {
          row[g] = parseKeyPart(keyParts[i]);
        });
        for (const a of aggs) row[a.as] = computeAggregate(groupRowsList, a);
        out.push(row);
      }
    } else if (query.aggregates && query.aggregates.length > 0) {
      // Global aggregates (no group-by) → single summary row.
      columns = query.aggregates.map((a) => a.as);
      const row: Record<string, Cell> = {};
      for (const a of query.aggregates) row[a.as] = computeAggregate(rows, a);
      out = [row];
    } else {
      // Plain projection.
      columns = ds.columns.map((c) => c.name);
      out = rows.map((r) => ({ ...r }));
    }

    if (query.orderBy) {
      const col = query.orderBy;
      const dir = query.orderDesc ? -1 : 1;
      out = [...out].sort((a, b) => dir * compareCells(a[col], b[col]));
    }
    if (query.limit !== undefined) out = out.slice(0, query.limit);

    return { columns, rows: out, generatedAt: this._clock.now() };
  }

  /**
   * The max value of `column` across `rows` — used to advance the
   * incremental watermark after a run.
   */
  maxWatermark(dataset: string, column: string): Cell | null {
    const ds = this._store.getOrThrow(dataset);
    let max: Cell | null = null;
    for (const r of ds.rows) {
      const v = r[column];
      if (v === null) continue;
      if (max === null || compareCells(v, max) > 0) max = v;
    }
    return max;
  }
}

// ---------------------------------------------------------------- filters

function applyFilter(rows: readonly Row[], f: Filter): readonly Row[] {
  return rows.filter((r) => matchCell(r[f.column], f));
}

function matchCell(v: Cell, f: Filter): boolean {
  switch (f.op) {
    case 'eq': return compareCells(v, f.value as Cell) === 0;
    case 'neq': return compareCells(v, f.value as Cell) !== 0;
    case 'gt': return compareCells(v, f.value as Cell) > 0;
    case 'gte': return compareCells(v, f.value as Cell) >= 0;
    case 'lt': return compareCells(v, f.value as Cell) < 0;
    case 'lte': return compareCells(v, f.value as Cell) <= 0;
    case 'in': {
      const list = f.value as readonly Cell[];
      return list.some((x) => compareCells(v, x) === 0);
    }
    case 'contains': {
      if (typeof v !== 'string' || typeof f.value !== 'string') return false;
      return v.includes(f.value);
    }
    case 'between': {
      const [lo, hi] = f.value as readonly [Cell, Cell];
      return compareCells(v, lo) >= 0 && compareCells(v, hi) <= 0;
    }
  }
}

// ---------------------------------------------------------------- grouping

function groupRows(rows: readonly Row[], keys: readonly string[]): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = keys.map((k) => keyPart(r[k])).join('');
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  return groups;
}

/** Serialize a cell into a grouping key part. */
function keyPart(v: Cell): string {
  if (v === null) return 'null';
  if (v instanceof Date) return `d${v.getTime()}`;
  return `${typeof v}:${String(v)}`;
}

function parseKeyPart(s: string): Cell {
  if (s === 'null') return null;
  if (s.startsWith('d')) return new Date(Number(s.slice(1)));
  const idx = s.indexOf(':');
  const type = s.slice(0, idx);
  const text = s.slice(idx + 1);
  if (type === 'number') return Number(text);
  if (type === 'boolean') return text === 'true';
  return text;
}

// ---------------------------------------------------------------- aggregates

function computeAggregate(rows: readonly Row[], a: Aggregate): Cell {
  const values = a.column === null ? rows.map(() => 1 as Cell) : rows.map((r) => r[a.column!]);
  const nonNull = values.filter((v): v is Exclude<Cell, null> => v !== null);

  switch (a.fn) {
    case 'count': return nonNull.length;
    case 'countDistinct': return new Set(nonNull.map((v) => keyPart(v))).size;
    case 'first': return nonNull[0] ?? null;
    case 'last': return nonNull[nonNull.length - 1] ?? null;
    case 'sum': {
      let s = 0;
      for (const v of nonNull) s += toNumber(v, a);
      return s;
    }
    case 'avg': {
      if (nonNull.length === 0) return null;
      let s = 0;
      for (const v of nonNull) s += toNumber(v, a);
      return s / nonNull.length;
    }
    case 'min': {
      if (nonNull.length === 0) return null;
      return nonNull.reduce((m, v) => (compareCells(v, m) < 0 ? v : m));
    }
    case 'max': {
      if (nonNull.length === 0) return null;
      return nonNull.reduce((m, v) => (compareCells(v, m) > 0 ? v : m));
    }
  }
}

function toNumber(v: Cell, a: Aggregate): number {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw new ReportError(
    'TYPE_MISMATCH',
    `aggregate '${a.fn}' on '${a.column}' got non-numeric '${String(v)}'`
  );
}

// ---------------------------------------------------------------- compare

/**
 * Total order over cells: null < everything; dates compare by epoch;
 * numbers numerically; booleans false<true; strings lexically. Mixed types
 * compare by type rank for determinism.
 */
export function compareCells(a: Cell, b: Cell): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b));
}

function rank(v: Cell): number {
  if (v === null) return -1;
  if (v instanceof Date) return 3;
  if (typeof v === 'number') return 0;
  if (typeof v === 'boolean') return 1;
  return 2; // string
}

// ---------------------------------------------------------------- bucketing

/**
 * Truncate an epoch-ms timestamp to a bucket boundary (UTC).
 * 'week' buckets start Monday (ISO-8601 convention).
 */
export function bucketStart(epochMs: number, size: BucketSize): number {
  const d = new Date(epochMs);
  switch (size) {
    case 'hour':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
    case 'day':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    case 'week': {
      const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      // getUTCDay: 0=Sun..6=Sat; Monday-start shift
      const dow = (d.getUTCDay() + 6) % 7;
      return day - dow * 86_400_000;
    }
    case 'month':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
}

/**
 * Bucket rows by a date column. Returns [bucketStart, rows][] sorted by
 * bucket start.
 */
export function bucketRows(
  rows: readonly Row[],
  dateColumn: string,
  size: BucketSize
): readonly { bucket: number; rows: readonly Row[] }[] {
  const map = new Map<number, Row[]>();
  for (const r of rows) {
    const v = r[dateColumn];
    if (!(v instanceof Date)) continue;
    const b = bucketStart(v.getTime(), size);
    const arr = map.get(b);
    if (arr) arr.push(r);
    else map.set(b, [r]);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, rs]) => ({ bucket, rows: rs }));
}
