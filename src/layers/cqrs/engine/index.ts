/**
 * CQRS engine — read-model store with checkpoints, lag alerting,
 * query routing, rebuild orchestration, denormalization helpers,
 * and the distributed read-side module: read-model replication with
 * staleness tracking, per-query-type result caching with
 * projection-driven invalidation, entity-sharded read models, and
 * eventual-consistency SLO measurement (percentiles + error budget).
 */

export * from './ReadModelStore';
export * from './ConsistencyMonitor';
export * from './QueryRouter';
export * from './RebuildOrchestrator';
export * from './Assembly';
export * from './ShardedReadModel';
export * from './ReadModelReplication';
export * from './QueryCache';
export * from './ConsistencySla';
export * from './ReplicaQueryRouter';
