/**
 * Sharding Engine — public surface.
 *
 * Distributed-storage machinery for the repository engine: consistent-hash
 * shard routing, cross-shard scatter/gather with k-way merge, read/write
 * splitting across lag-aware replicas, connection retry with jittered
 * backoff, EXPLAIN-style plan analysis, and field-level PII masking.
 *
 * @module RepositoryLayer/Engine/Sharding
 */

export { ShardRouter, fnv1a } from './ShardRouter';
export { ShardRebalancer } from './ShardRebalancer';
export type { MigrationTask, MigrationPlan, RebalanceProgress } from './ShardRebalancer';
export { ShardTopology } from './ShardTopology';
export type { ShardDescriptor, TopologyOptions } from './ShardTopology';
export type { ShardRouterOptions } from './ShardRouter';
export { CrossShardQuery } from './CrossShardQuery';
export type { CrossShardQueryOptions, FanOutResult, ShardRow_ } from './CrossShardQuery';
export { ReplicaSet } from './ReplicaSet';
export type { ReadRoute } from './ReplicaSet';
export { ConnectionRetrier, RetryableConnectionError } from './ConnectionRetrier';
export type { RetryOptions, ErrorClass } from './ConnectionRetrier';
export { QueryPlanAnalyzer } from './QueryPlanAnalyzer';
export type { AnalyzerOptions, TableStats } from './QueryPlanAnalyzer';
export { DataMasker } from './DataMasker';
export type { MaskPolicy } from './DataMasker';
export { MapStore } from './MapStore';
export type { MapStoreOptions } from './MapStore';
export { ShardingEngine } from './ShardingEngine';
export type { ShardingEngineOptions } from './ShardingEngine';
export {
  ShardKeyError,
  CrossShardError,
  RetryExhaustedError,
  NoFreshReplicaError,
} from './types';
export type {
  Shard,
  ShardStore,
  ShardKeyFn,
  Replica,
  FanOutQuery,
  ShardRow,
  PlanNode,
  PlanNodeKind,
  PlanDiagnostic,
  PlanReport,
  MaskRule,
  MaskKind,
} from './types';
