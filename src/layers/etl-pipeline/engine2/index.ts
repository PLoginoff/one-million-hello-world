/**
 * ETL Pipeline Engine 2 — public surface.
 *
 * Source/target reconciliation with diff reports, resumable incremental
 * CDC with position tracking, pipeline dependency scheduling, error
 * quarantine, and schema-version compatibility.
 *
 * @module EtlPipeline/Engine2
 */

export { hashRow, reconcile, Reconciler } from './Reconciliation';
export type { DiffReport, KeyDiff, ReconcileOptions } from './Reconciliation';

export {
  ArrayChangeLog,
  CollectingSink,
  IncrementalCdcProcessor,
  MemoryPositionStore,
} from './IncrementalCdc';
export type {
  CdcRunReport,
  IChangeLog,
  IChangeSink,
  IncrementalOptions,
  IPositionStore,
} from './IncrementalCdc';

export { DependencyGraph, ParallelScheduler } from './PipelineDeps';
export type {
  PipelineNode,
  PipelineRun,
  PipelineRunStatus,
  PipelineTask,
  SchedulerOptions,
} from './PipelineDeps';

export { MemoryQuarantineSink, QuarantinedPipeline } from './ErrorQuarantine';
export type {
  IQuarantineSink,
  PipelineRunStats,
  QuarantinedRecord,
  QuarantineOptions,
  QuarantineSchema,
  RowProcessor,
} from './ErrorQuarantine';

export { RowValidator, rulesFromSchema, ValidationError } from './RowValidator';
export type { CheckKind, ColumnRule, Violation } from './RowValidator';

export { diffSchemas, PipelineVersionRegistry } from './PipelineVersioning';
export type {
  CompatibilityMode,
  PipelineSchema,
  SchemaColumn,
  SchemaColumnType,
  SchemaDiff,
} from './PipelineVersioning';
