/**
 * Error Quarantine — bad records to a typed side output.
 *
 * When a row fails validation/transformation mid-pipeline, dropping it
 * silently loses data and failing the whole run wastes good rows.
 * Quarantine routes failures to a `QuarantineSink` carrying:
 *
 *   - the offending row,
 *   - the pipeline stage and error that tripped it,
 *   - an inferred schema of the *bad* rows (useful to spot a systematic
 *     producer change — "all failures since Tuesday have `amount` as
 *     string"),
 *   - a failure fingerprint (group identical root causes).
 *
 * `QuarantinedPipeline` wraps a row processor: good rows flow to the
 * main sink, failures to the quarantine sink, with stats reported.
 * Retry support: re-drive quarantined rows through a fixed processor
 * after a schema fix.
 *
 * @module EtlPipeline/Engine2
 */

import { Row } from '../engine/DagEngine';
import { fingerprint } from '../../data-warehouse/engine2/WorkloadAnalysis';

/** A record that failed processing, with context. */
export interface QuarantinedRecord {
  readonly row: Row;
  readonly stage: string;
  readonly error: string;
  /** Failure fingerprint — groups identical error patterns. */
  readonly failureClass: string;
  readonly at: number;
}

/** Inferred shape of quarantined rows — "what do the bad rows look like". */
export interface QuarantineSchema {
  /** column → observed JSON types */
  readonly columns: Readonly<Record<string, readonly string[]>>;
  readonly recordCount: number;
}

export interface IQuarantineSink {
  write(record: QuarantinedRecord): void;
}

/** In-memory quarantine sink with schema inference + paging. */
export class MemoryQuarantineSink implements IQuarantineSink {
  private readonly records: QuarantinedRecord[] = [];
  private readonly typeMap = new Map<string, Set<string>>();

  write(record: QuarantinedRecord): void {
    this.records.push(record);
    for (const [k, v] of Object.entries(record.row)) {
      let s = this.typeMap.get(k);
      if (!s) {
        s = new Set();
        this.typeMap.set(k, s);
      }
      s.add(jsonType(v));
    }
  }

  recordsAll(): readonly QuarantinedRecord[] {
    return this.records.slice();
  }

  byFailureClass(cls: string): readonly QuarantinedRecord[] {
    return this.records.filter((r) => r.failureClass === cls);
  }

  /** Inferred schema across quarantined rows. */
  schema(): QuarantineSchema {
    const columns: Record<string, readonly string[]> = {};
    for (const [k, s] of this.typeMap) columns[k] = [...s].sort();
    return { columns, recordCount: this.records.length };
  }

  /** Count of records per failure class — "what broke most". */
  failureHistogram(): ReadonlyMap<string, number> {
    const h = new Map<string, number>();
    for (const r of this.records) h.set(r.failureClass, (h.get(r.failureClass) ?? 0) + 1);
    return h;
  }

  /** Drain all records (for replay after a fix). */
  drain(): QuarantinedRecord[] {
    const out = this.records.slice();
    this.records.length = 0;
    this.typeMap.clear();
    return out;
  }
}

/** A row processor — throws or returns a processed row. */
export type RowProcessor = (row: Row) => Row | Promise<Row>;

export interface QuarantineOptions {
  readonly stage: string;
  /** Inject clock for tests. */
  readonly clock?: () => number;
}

export interface PipelineRunStats {
  readonly total: number;
  readonly succeeded: number;
  readonly quarantined: number;
  readonly failureClasses: ReadonlyMap<string, number>;
}

/**
 * Wrap a processor: good rows → main sink, exceptions → quarantine.
 * Never throws on a bad row; stats accumulate for the run.
 */
export class QuarantinedPipeline {
  private readonly sink: IQuarantineSink;
  private readonly stage: string;
  private readonly clock: () => number;
  private stats = { total: 0, succeeded: 0, quarantined: 0 };
  private readonly classes = new Map<string, number>();

  constructor(
    private readonly processor: RowProcessor,
    sink: IQuarantineSink,
    options: QuarantineOptions
  ) {
    this.sink = sink;
    this.stage = options.stage;
    this.clock = options.clock ?? Date.now;
  }

  /** Process one row; returns the processed row or null if quarantined. */
  async process(row: Row): Promise<Row | null> {
    this.stats.total++;
    try {
      const out = await this.processor(row);
      this.stats.succeeded++;
      return out;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      const cls = failureClass(error);
      this.stats.quarantined++;
      this.classes.set(cls, (this.classes.get(cls) ?? 0) + 1);
      this.sink.write({ row, stage: this.stage, error, failureClass: cls, at: this.clock() });
      return null;
    }
  }

  /** Process a batch; returns the good rows in order. */
  async processBatch(rows: readonly Row[]): Promise<Row[]> {
    const out: Row[] = [];
    for (const r of rows) {
      const p = await this.process(r);
      if (p !== null) out.push(p);
    }
    return out;
  }

  getStats(): PipelineRunStats {
    return { ...this.stats, failureClasses: new Map(this.classes) };
  }
}

/** Group errors by shape, not literal value — 'not a number' for any column. */
function failureClass(error: string): string {
  // fingerprint() strips literals → same-class errors group together.
  return fingerprint(error);
}

function jsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
