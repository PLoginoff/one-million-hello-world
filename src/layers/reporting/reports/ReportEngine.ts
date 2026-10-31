/**
 * Report Engine
 *
 * Facade composing the store, pipeline, pivot, scheduler, and exporter:
 *
 *   defineDataset / insertRows         → DatasetStore
 *   run(query)                         → QueryPipeline (+ pivot)
 *   schedule(sched) / runDue()         → cron-driven scheduled runs
 *   runIncremental(scheduleId)         → watermark-advanced snapshot
 *   export(result, 'csv' | 'json')     → ReportExporter
 *
 * Scheduled runs produce a {@link ReportRun} per execution; incremental
 * schedules carry a watermark so each run only processes new rows.
 *
 * @module ReportingLayer/Reports
 */

import {
  Cell,
  Clock,
  ColumnSpec,
  PivotSpec,
  ReportError,
  ReportQuery,
  ReportResult,
  ReportRun,
  ReportSchedule,
  Row,
  SystemClock,
} from './ReportTypes';
import { DatasetStore } from './DatasetStore';
import { QueryPipeline } from './QueryPipeline';
import { PivotTable } from './PivotTable';
import { CronExpression } from './CronSchedule';
import { ReportExporter, ExportFormat } from './ReportExporter';

export class ReportEngine {
  readonly datasets = new DatasetStore();
  readonly exporter = new ReportExporter();
  readonly pivots = new PivotTable();

  private readonly _pipeline: QueryPipeline;
  private readonly _schedules = new Map<string, { sched: ReportSchedule; cron: CronExpression; lastWatermark: Cell | null; lastCheckedAt: number }>();
  private readonly _runs: ReportRun[] = [];
  private _seq = 0;

  constructor(private readonly _clock: Clock = new SystemClock()) {
    this._pipeline = new QueryPipeline(this.datasets, _clock);
  }

  // ------------------------------------------------------------ datasets

  defineDataset(name: string, columns: readonly ColumnSpec[]): void {
    this.datasets.define(name, columns);
  }

  insertRows(dataset: string, rows: readonly Row[]): void {
    this.datasets.insertAll(dataset, rows);
  }

  // ------------------------------------------------------------ ad-hoc queries

  /**
   * Run a query. When `query.pivot` is set, the grouped result is fed
   * through the pivot transform.
   */
  run(query: ReportQuery): ReportResult {
    if (query.pivot) return this._runPivot(query);
    return this._pipeline.run(query);
  }

  private _runPivot(query: ReportQuery): ReportResult {
    // For pivots we need RAW filtered rows (not grouped), because the pivot
    // does its own grouping. Re-run with groupBy/aggregates stripped.
    const raw = this._pipeline.run({
      ...query,
      groupBy: undefined,
      aggregates: undefined,
      orderBy: undefined,
      limit: undefined,
      pivot: undefined,
    });
    return this.pivots.build(raw.rows, query.pivot!, this._clock.now());
  }

  // ------------------------------------------------------------ scheduling

  /**
   * Register a cron-scheduled report.
   */
  schedule(sched: ReportSchedule): void {
    const cron = new CronExpression(sched.cron); // throws on bad expr
    this._schedules.set(sched.scheduleId, {
      sched,
      cron,
      lastWatermark: null,
      lastCheckedAt: this._clock.now(),
    });
  }

  unschedule(scheduleId: string): boolean {
    return this._schedules.delete(scheduleId);
  }

  /**
   * Next fire time for a schedule after `from`.
   */
  nextRun(scheduleId: string, from?: number): number | null {
    const s = this._schedules.get(scheduleId);
    if (!s) throw new ReportError('INVALID_QUERY', `no schedule '${scheduleId}'`);
    return s.cron.next(from ?? this._clock.now());
  }

  /**
   * Schedules due at or before `now` since their last run. Returns the
   * runs executed.
   */
  runDue(now?: number): readonly ReportRun[] {
    const t = now ?? this._clock.now();
    const out: ReportRun[] = [];
    for (const [id, entry] of this._schedules) {
      // A run is due when a fire time exists in (lastCheckedAt, t].
      const next = entry.cron.next(entry.lastCheckedAt);
      if (next !== null && next <= t) {
        out.push(this._execute(id));
      }
      entry.lastCheckedAt = t;
    }
    return out;
  }

  /**
   * Execute a schedule right now (manual trigger or due-fire). Incremental
   * schedules filter on the stored watermark, then advance it.
   */
  runOnce(scheduleId: string): ReportRun {
    if (!this._schedules.has(scheduleId)) {
      throw new ReportError('INVALID_QUERY', `no schedule '${scheduleId}'`);
    }
    return this._execute(scheduleId);
  }

  private _execute(scheduleId: string): ReportRun {
    const entry = this._schedules.get(scheduleId)!;
    const run: ReportRun = {
      scheduleId,
      startedAt: this._clock.now(),
      finishedAt: null,
      rowCount: 0,
      watermark: entry.lastWatermark,
    };
    this._runs.push(run);
    const result = entry.sched.incremental && entry.sched.query.incrementalColumn
      ? this._pipeline.run(entry.sched.query, entry.lastWatermark ?? undefined)
      : this.run(entry.sched.query);
    run.rowCount = result.rows.length;
    run.finishedAt = this._clock.now();
    if (entry.sched.incremental && entry.sched.query.incrementalColumn) {
      const w = this._pipeline.maxWatermark(entry.sched.query.dataset, entry.sched.query.incrementalColumn);
      if (w !== null) {
        entry.lastWatermark = w;
        run.watermark = w;
      }
    }
    return run;
  }

  /**
   * Execute a schedule and return the exported payload directly.
   */
  runAndExport(scheduleId: string, format: ExportFormat): string {
    const entry = this._schedules.get(scheduleId);
    if (!entry) throw new ReportError('INVALID_QUERY', `no schedule '${scheduleId}'`);
    const result = this.run(entry.sched.query);
    return this.exporter.export(result, format);
  }

  /** All recorded runs for a schedule, newest last. */
  runHistory(scheduleId: string): readonly ReportRun[] {
    return this._runs.filter((r) => r.scheduleId === scheduleId);
  }
}
