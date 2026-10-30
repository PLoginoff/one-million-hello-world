/**
 * Data Warehouse Engine 2 — public surface.
 *
 * Table-level column statistics, cost-based query planning (predicate
 * pushdown, projection pruning, join ordering), materialized-view
 * matching and workload analysis.
 *
 * @module DataWarehouse/Engine2
 */

export { DistinctEstimator, Histogram, StatsCollector, estimateSelectivity } from './ColumnStats';
export type { ColumnStats, TableStats } from './ColumnStats';

export { QueryPlanner } from './QueryPlanner';
export type {
  ExplainRow,
  JoinClause,
  PlanNode,
  PredExpr,
  QueryAst,
  WhereExpr,
} from './QueryPlanner';

export { MvMatcher } from './MvMatcher';
export type { MvMatch, MvSignature } from './MvMatcher';

export { fingerprint, WorkloadTracker } from './WorkloadAnalysis';
export type {
  FingerprintStats,
  QueryRecord,
  SlowQuery,
  WorkloadOptions,
} from './WorkloadAnalysis';
