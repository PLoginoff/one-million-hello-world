/**
 * Repository Engine — public surface.
 *
 * Second query engine for the repository layer: spec-tree compilation to
 * predicates + parameterized SQL, opaque-cursor keyset pagination,
 * optimistic-locked/soft-deleting versioned store with secondary indexes,
 * chunked batch writes, and percentile query metrics.
 *
 * @module RepositoryLayer/Engine
 */

export { Spec, FieldBuilder } from './Spec';
export { SpecCompiler } from './SpecCompiler';
export { CursorPaginator } from './CursorPaginator';
export { QueryMetrics } from './QueryMetrics';
export type { PercentileSnapshot, QueryMetricsOptions } from './QueryMetrics';
export { VersionedStore } from './VersionedStore';
export type { StoredEntity, StoreOptions, BatchProgress } from './VersionedStore';
export { RepositoryEngine } from './RepositoryEngine';
export type { EngineQuery } from './RepositoryEngine';
export { getPath, compareValues, stableStringify } from './path';
export {
  OptimisticLockError,
  CursorError,
  SpecError,
} from './types';
export type {
  CmpOp,
  SpecNode,
  SortKey,
  PageArgs,
  PageInfo,
  Page,
  CompiledSpec,
} from './types';
export * from './sharding';
