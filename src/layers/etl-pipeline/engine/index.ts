/**
 * ETL Pipeline Engine — public surface.
 *
 * DAG execution engine, extract/transform/load operators,
 * retry/backoff, checkpointing and lineage capture.
 *
 * @module EtlPipeline/Engine
 */

export { DagPipelineEngine, DEFAULT_RETRY, backoffMs, findCycle, topoLayers } from './DagEngine';
export type {
  LineageEdge,
  PipelineCheckpoint,
  PipelineDef,
  PipelineReport,
  RetryPolicy,
  Row,
  RowBatch,
  StageContext,
  StageDef,
  StageResult,
} from './DagEngine';

export {
  MemorySink,
  aggregateRows,
  arraySource,
  batchExtractor,
  bulkLoader,
  dedupeRows,
  filterRows,
  flatMapRows,
  incrementalExtractor,
  joinBatches,
  mapRows,
  pagedExtractor,
  unionRows,
  upsertLoader,
  windowRows,
} from './Operators';
export type { RowSink, RowSource } from './Operators';

export { CdcProcessor, KeyedStateStore, diffSnapshots } from './CdcEngine';
export type { CdcEvent, CdcOp, CdcOptions, StateChange } from './CdcEngine';

export { LineageGraph } from './LineageGraph';
export type { LineageNode as EtlLineageNode } from './LineageGraph';

export {
  MicroBatchStream,
  WatermarkTracker,
  assignWindows,
  collectAggregator,
  countAggregator,
  makeCountAggregator,
  minMaxAggregator,
  sumAggregator,
} from './StreamEngine';
export type {
  StreamRecord,
  WindowAggregator,
  WindowResult,
  WindowSpec,
} from './StreamEngine';

