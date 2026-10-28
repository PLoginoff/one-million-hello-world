export { CacheDefaultStrategy } from './DefaultStrategy';
export { CacheFastStrategy } from './FastStrategy';
export { CacheReliableStrategy } from './ReliableStrategy';
export { CacheCachedStrategy } from './CachedStrategy';
export { CacheBatchStrategy } from './BatchStrategy';

// New Strategy Pattern implementations
export type { ICacheStrategy, CacheStrategyContext, CacheStrategyResult } from './ICacheStrategy';
export { DefaultCacheStrategy } from './DefaultCacheStrategy';
export {
  LoggingCacheStrategy,
  type ICacheLogger,
  type CacheLogEntry,
  LogLevel,
  ConsoleCacheLogger,
} from './LoggingCacheStrategy';
export {
  MetricsCacheStrategy,
  type ICacheMetricsCollector,
  type CacheMetric,
  type CacheStrategyMetrics,
  InMemoryCacheMetricsCollector,
} from './MetricsCacheStrategy';
