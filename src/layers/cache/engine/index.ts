/**
 * Cache Engine — public exports.
 *
 * @module CacheLayer/Engine
 */

export * from './types';
export { MultiLevelCache } from './MultiLevelCache';
export type { MultiLevelCacheOptions, MultiLevelGetResult, MultiLevelCacheStats } from './MultiLevelCache';
export { SingleFlightCache, StampedeLimitError } from './SingleFlightCache';
export type {
  CacheLoader,
  SingleFlightOptions,
  SingleFlightResult,
  SingleFlightStats,
} from './SingleFlightCache';
export { CacheWarmer } from './CacheWarmer';
export type { WarmLoader, WarmSink, WarmerOptions, WarmFailure, WarmReport } from './CacheWarmer';
export { TagInvalidationIndex } from './TagInvalidationIndex';
export { AdaptiveTtlPolicy } from './AdaptiveTtlPolicy';
export type { AdaptiveTtlOptions, KeyTtlDecision } from './AdaptiveTtlPolicy';
export { ConsistentHashRing } from './ConsistentHashRing';
export type { RingNode } from './ConsistentHashRing';
export { CountMinSketch, TinyLfuAdmission } from './CountMinSketch';
export { CountingBloomFilter } from './BloomFilter';
export {
  CoherenceBus,
  CoherentNode,
  CoherenceState,
  compareVersions,
  isNewer,
  seededRng,
  keyHash,
} from './DistributedCoherence';
export type {
  VersionStamp,
  CoherenceMessage,
  CoherenceFabric,
  CoherentEntry,
  CoherentNodeOptions,
  CoherenceGetResult,
  NodeStats,
} from './DistributedCoherence';
export { CachePartitionRouter } from './CachePartitionRouter';
export type {
  Partition,
  RouteDecision,
  RouteGroup,
  MigrationStep,
  MigrationPlan,
  RouterOptions,
} from './CachePartitionRouter';
export { HotKeyMitigator, SplitKeyAccessor, MapKeyValueStore } from './HotKeyMitigator';
export type {
  KeyValueStore,
  HotKeyOptions,
  HotKeyInfo,
  MitigatorStats,
} from './HotKeyMitigator';
