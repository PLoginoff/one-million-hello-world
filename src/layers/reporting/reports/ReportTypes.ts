/**
 * Reporting Types
 *
 * Core types for the report builder: dataset column specs, query pipeline
 * ops (filter / aggregate / group / pivot), time-series bucketing, schedule
 * definitions, and export formats.
 *
 * @module ReportingLayer/Reports
 */

/** Supported column value kinds. */
export type ColumnType = 'string' | 'number' | 'boolean' | 'date';

/** A typed column in a dataset definition. */
export interface ColumnSpec {
  readonly name: string;
  readonly type: ColumnType;
  /** Optional display label for exports. */
  readonly label?: string;
}

/** A dataset: named schema + in-memory rows. */
export interface Dataset {
  readonly name: string;
  readonly columns: readonly ColumnSpec[];
  rows: Row[];
}

/** A data row — values keyed by column name. */
export type Row = Readonly<Record<string, Cell>>;
export type Cell = string | number | boolean | Date | null;

// ---------------------------------------------------------------- filters

/** Comparison ops usable in filters. */
export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'between';

export interface Filter {
  readonly column: string;
  readonly op: FilterOp;
  readonly value: Cell | readonly Cell[] | readonly [Cell, Cell];
}

// ---------------------------------------------------------------- aggregates

export type AggregateFn = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countDistinct' | 'first' | 'last';

export interface Aggregate {
  readonly column: string | null; // null = count(*)
  readonly fn: AggregateFn;
  /** Output column name. */
  readonly as: string;
}

// ---------------------------------------------------------------- pipeline

/** A full report query: filter → group+aggregate → optional pivot. */
export interface ReportQuery {
  readonly dataset: string;
  readonly filters?: readonly Filter[];
  /** Group-by columns; when present, aggregates are computed per group. */
  readonly groupBy?: readonly string[];
  readonly aggregates?: readonly Aggregate[];
  /** Sort output by this column. */
  readonly orderBy?: string;
  readonly orderDesc?: boolean;
  readonly limit?: number;
  /** Pivot spec — transform grouped rows into a matrix. */
  readonly pivot?: PivotSpec;
  /** Incremental watermark column (e.g. created_at). */
  readonly incrementalColumn?: string;
}

export interface PivotSpec {
  /** Column whose distinct values become output columns. */
  readonly column: string;
  /** Row dimension (group-by column kept as the row key). */
  readonly rowDimension: string;
  /** Value aggregation: which aggregate to pivot. */
  readonly value: Aggregate;
  /** Fill empty cells with this value (default 0). */
  readonly fill?: Cell;
}

// ---------------------------------------------------------------- bucketing

export type BucketSize = 'hour' | 'day' | 'week' | 'month';

/** A scheduled report definition. */
export interface ReportSchedule {
  readonly scheduleId: string;
  readonly query: ReportQuery;
  /** Cron-like expression (5-field). */
  readonly cron: string;
  /** True → only include rows where incrementalColumn > lastRun watermark. */
  readonly incremental?: boolean;
}

/** One run of a scheduled report. */
export interface ReportRun {
  readonly scheduleId: string;
  readonly startedAt: number;
  finishedAt: number | null;
  rowCount: number;
  /** High-water mark for incremental runs (max incrementalColumn seen). */
  watermark: Cell | null;
}

/** A materialized report result — rows + column order. */
export interface ReportResult {
  readonly columns: readonly string[];
  readonly rows: readonly Row[];
  readonly generatedAt: number;
}

/** Injectable clock. */
export interface Clock {
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class ReportError extends Error {
  constructor(
    public readonly code:
      | 'DATASET_NOT_FOUND'
      | 'COLUMN_NOT_FOUND'
      | 'INVALID_QUERY'
      | 'INVALID_CRON'
      | 'TYPE_MISMATCH'
      | 'EXPORT_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'ReportError';
  }
}
