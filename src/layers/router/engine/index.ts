/**
 * Router Engine — public exports.
 *
 * Radix-trie route resolution with specificity scoring, parametric and
 * wildcard segments, per-route middleware, groups with shared prefixes,
 * LRU-cached lookups, and 405 detection.
 *
 * Extended with:
 * - versioned route tables with per-route deprecation/sunset
 * - regex param constraints + host-pattern matching
 * - subdomain dispatch across per-host route tables
 * - per-route hit/latency metrics
 * - atomic route-table hot-swap
 *
 * @module RouterLayer/Engine
 */

export * from './types';

export {
  RadixTrieRouter,
  RouteConflictError,
  tokenizePattern,
  composePipeline,
} from './RadixTrieRouter';

export { RouteCache } from './RouteCache';

export { RouterEngine } from './RouterEngine';
export type { RouterEngineOptions } from './RouterEngine';

export { VersionedRouterEngine } from './RouteVersioning';
export type {
  VersionStrategy,
  VersionedRoute,
  RouteDeprecationInfo,
  VersionedDispatchResult,
  VersionedRouterOptions,
  VersionTableStats,
} from './RouteVersioning';

export { ConstrainedRouterEngine, compileHostPattern, matchHost, parseConstrainedPattern } from './RouteConstraints';
export type {
  HostPattern,
  HostPart,
  ParamConstraint,
  ConstrainedRoute,
  HostMatch,
} from './RouteConstraints';

export { SubdomainRouter } from './SubdomainRouter';
export type { SubdomainBucket, SubdomainDispatchResult, SubdomainRouterOptions } from './SubdomainRouter';

export { RouteMetricsCollector, instrumentedDispatch } from './RouteMetrics';
export type {
  RouteMetricsOptions,
  RouteMetrics,
  RouteMetricsSnapshot,
} from './RouteMetrics';

export { HotSwapRouter, stageRoutes } from './HotSwapRouter';
export type { SwapRecord, HotSwapOptions } from './HotSwapRouter';

export { RoutePlanner, RoutePlanError } from './RoutePlanner';
export type {
  NamedMiddleware,
  PlannedRoute,
  RouteTable,
  RoutePlanDiagnostic,
  RoutePlannerOptions,
} from './RoutePlanner';
