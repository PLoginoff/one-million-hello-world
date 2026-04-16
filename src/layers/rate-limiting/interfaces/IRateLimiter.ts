/**
 * Rate Limiter Interface
 * 
 * Defines the contract for rate limiting operations
 * using various strategies (token bucket, sliding window, etc.).
 */

import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { SecurityContext } from '../../security/types/security-types';
import {
  RateLimitResult,
  RateLimitConfig,
  RateLimitIdentifier,
  RateLimitStats,
  ExtendedRateLimitResult,
  RateLimitMetrics,
  RateLimitHealthStatus,
  RateLimitDiagnostics,
  RateLimitWarning,
  RateLimitBucketInfo,
  RateLimitPattern,
  RateLimitTier,
  RateLimitQuota,
  RateLimitUsage,
  RateLimitRule,
  RateLimitException,
  RateLimitStrategy,
  RateLimitErrorCode,
  RateLimitScope,
  RateLimitAction,
  InternalLayer,
  InternalLayerIdentifier,
  InternalLayerRateLimitConfig,
  InternalLayerRateLimitResult,
  InternalLayerContext,
  LayerRateLimitStats,
  CrossLayerRateLimitConfig,
  CrossLayerRateLimitResult,
  LayerDependencyGraph,
  LayerNode,
  LayerEdge,
  LayerHealthStatus,
  RateLimitCascadeConfig,
  AdaptiveRateLimitConfig,
  RateLimitPrediction,
} from '../types/rate-limiting-types';

/**
 * Interface for rate limiting operations
 */
export interface IRateLimiter {
  /**
   * Checks if a request is allowed based on rate limits
   * 
   * @param request - HTTP request to check
   * @param context - Security context for user-based limiting
   * @param identifier - Custom identifier for rate limiting
   * @returns Rate limit result with allowance information
   */
  checkRateLimit(
    request: HttpRequest,
    context?: SecurityContext,
    identifier?: RateLimitIdentifier
  ): RateLimitResult;

  /**
   * Sets the rate limit configuration
   * 
   * @param config - Rate limit configuration
   */
  setRateLimitConfig(config: RateLimitConfig): void;

  /**
   * Gets the current rate limit configuration
   * 
   * @returns Current rate limit configuration
   */
  getRateLimitConfig(): RateLimitConfig;

  /**
   * Gets rate limit statistics
   * 
   * @returns Current rate limit statistics
   */
  getStats(): RateLimitStats;

  /**
   * Resets rate limit statistics
   */
  resetStats(): void;

  /**
   * Resets rate limit for a specific identifier
   * 
   * @param identifier - Identifier to reset
   */
  resetRateLimit(identifier: RateLimitIdentifier): void;

  /**
   * Clears all rate limit buckets
   */
  clearAllBuckets(): void;

  /**
   * Extracts rate limit identifier from request and context
   * 
   * @param request - HTTP request
   * @param context - Security context
   * @returns Rate limit identifier
   */
  extractIdentifier(
    request: HttpRequest,
    context?: SecurityContext
  ): RateLimitIdentifier;

  /**
   * Checks rate limit with extended result including metrics
   * 
   * @param request - HTTP request to check
   * @param context - Security context for user-based limiting
   * @param identifier - Custom identifier for rate limiting
   * @returns Extended rate limit result with metrics and warnings
   */
  checkRateLimitExtended(
    request: HttpRequest,
    context?: SecurityContext,
    identifier?: RateLimitIdentifier
  ): ExtendedRateLimitResult;

  /**
   * Checks rate limit using sliding window strategy
   * 
   * @param identifier - Rate limit identifier
   * @returns Rate limit result
   */
  checkSlidingWindow(identifier: RateLimitIdentifier): RateLimitResult;

  /**
   * Checks rate limit using fixed window strategy
   * 
   * @param identifier - Rate limit identifier
   * @returns Rate limit result
   */
  checkFixedWindow(identifier: RateLimitIdentifier): RateLimitResult;

  /**
   * Checks rate limit using leaky bucket strategy
   * 
   * @param identifier - Rate limit identifier
   * @returns Rate limit result
   */
  checkLeakyBucket(identifier: RateLimitIdentifier): RateLimitResult;

  /**
   * Gets bucket information for a specific identifier
   * 
   * @param identifier - Rate limit identifier
   * @returns Bucket information or null if not found
   */
  getBucketInfo(identifier: RateLimitIdentifier): RateLimitBucketInfo | null;

  /**
   * Gets bucket usage statistics
   * 
   * @param identifier - Rate limit identifier
   * @returns Usage statistics
   */
  getBucketUsage(identifier: RateLimitIdentifier): RateLimitUsage | null;

  /**
   * Adds a rate limit rule
   * 
   * @param rule - Rate limit rule to add
   */
  addRateLimitRule(rule: RateLimitRule): void;

  /**
   * Removes a rate limit rule
   * 
   * @param ruleId - ID of the rule to remove
   */
  removeRateLimitRule(ruleId: string): void;

  /**
   * Gets all rate limit rules
   * 
   * @returns Array of rate limit rules
   */
  getRateLimitRules(): RateLimitRule[];

  /**
   * Adds a rate limit exception
   * 
   * @param exception - Rate limit exception to add
   */
  addRateLimitException(exception: RateLimitException): void;

  /**
   * Removes a rate limit exception
   * 
   * @param exceptionId - ID of the exception to remove
   */
  removeRateLimitException(exceptionId: string): void;

  /**
   * Gets all rate limit exceptions
   * 
   * @returns Array of rate limit exceptions
   */
  getRateLimitExceptions(): RateLimitException[];

  /**
   * Sets rate limit tier for an identifier
   * 
   * @param identifier - Rate limit identifier
   * @param tier - Rate limit tier
   */
  setRateLimitTier(identifier: RateLimitIdentifier, tier: RateLimitTier): void;

  /**
   * Gets rate limit tier for an identifier
   * 
   * @param identifier - Rate limit identifier
   * @returns Rate limit tier or null if not set
   */
  getRateLimitTier(identifier: RateLimitIdentifier): RateLimitTier | null;

  /**
   * Gets rate limit metrics
   * 
   * @returns Rate limit metrics
   */
  getMetrics(): RateLimitMetrics;

  /**
   * Gets rate limit health status
   * 
   * @returns Rate limit health status
   */
  getHealthStatus(): RateLimitHealthStatus;

  /**
   * Runs rate limit diagnostics
   * 
   * @returns Rate limit diagnostics
   */
  runDiagnostics(): RateLimitDiagnostics;

  /**
   * Adds a rate limit warning
   * 
   * @param warning - Rate limit warning to add
   */
  addWarning(warning: RateLimitWarning): void;

  /**
   * Clears all rate limit warnings
   */
  clearWarnings(): void;

  /**
   * Gets all rate limit warnings
   * 
   * @returns Array of rate limit warnings
   */
  getWarnings(): RateLimitWarning[];

  /**
   * Cleans up expired buckets
   */
  cleanupExpiredBuckets(): void;

  /**
   * Gets current bucket count
   * 
   * @returns Number of active buckets
   */
  getBucketCount(): number;

  /**
   * Gets total usage across all buckets
   * 
   * @returns Total usage statistics
   */
  getTotalUsage(): RateLimitUsage;

  /**
   * Gets usage by identifier
   * 
   * @param identifier - Rate limit identifier
   * @returns Usage statistics
   */
  getUsageByIdentifier(identifier: RateLimitIdentifier): RateLimitUsage | null;

  /**
   * Sets quota for an identifier
   * 
   * @param identifier - Rate limit identifier
   * @param quota - Rate limit quota
   */
  setQuota(identifier: RateLimitIdentifier, quota: RateLimitQuota): void;

  /**
   * Gets quota for an identifier
   * 
   * @param identifier - Rate limit identifier
   * @returns Rate limit quota or null if not set
   */
  getQuota(identifier: RateLimitIdentifier): RateLimitQuota | null;

  /**
   * Resets quota for an identifier
   * 
   * @param identifier - Rate limit identifier
   */
  resetQuota(identifier: RateLimitIdentifier): void;

  /**
   * Checks if identifier has an exception
   * 
   * @param identifier - Rate limit identifier
   * @returns True if identifier has an exception
   */
  hasException(identifier: RateLimitIdentifier): boolean;

  /**
   * Gets applicable rule for an identifier
   * 
   * @param identifier - Rate limit identifier
   * @returns Applicable rate limit rule or null
   */
  getApplicableRule(identifier: RateLimitIdentifier): RateLimitRule | null;

  // Internal Layer Methods

  /**
   * Checks rate limit for internal layer
   * 
   * @param layerIdentifier - Internal layer identifier
   * @param context - Internal layer context
   * @returns Internal layer rate limit result
   */
  checkInternalLayerRateLimit(
    layerIdentifier: InternalLayerIdentifier,
    context?: InternalLayerContext
  ): InternalLayerRateLimitResult;

  /**
   * Sets rate limit config for internal layer
   * 
   * @param config - Internal layer rate limit config
   */
  setInternalLayerRateLimitConfig(config: InternalLayerRateLimitConfig): void;

  /**
   * Gets rate limit config for internal layer
   * 
   * @param layer - Internal layer
   * @returns Internal layer rate limit config or null
   */
  getInternalLayerRateLimitConfig(layer: InternalLayer): InternalLayerRateLimitConfig | null;

  /**
   * Gets rate limit stats for internal layer
   * 
   * @param layer - Internal layer
   * @returns Layer rate limit stats
   */
  getLayerRateLimitStats(layer: InternalLayer): LayerRateLimitStats;

  /**
   * Gets rate limit stats for all layers
   * 
   * @returns Array of layer rate limit stats
   */
  getAllLayerRateLimitStats(): LayerRateLimitStats[];

  /**
   * Checks cross-layer rate limit
   * 
   * @param sourceLayer - Source internal layer
   * @param targetLayer - Target internal layer
   * @returns Cross-layer rate limit result
   */
  checkCrossLayerRateLimit(
    sourceLayer: InternalLayer,
    targetLayer: InternalLayer
  ): CrossLayerRateLimitResult;

  /**
   * Sets cross-layer rate limit config
   * 
   * @param config - Cross-layer rate limit config
   */
  setCrossLayerRateLimitConfig(config: CrossLayerRateLimitConfig): void;

  /**
   * Gets cross-layer rate limit config
   * 
   * @param sourceLayer - Source internal layer
   * @param targetLayer - Target internal layer
   * @returns Cross-layer rate limit config or null
   */
  getCrossLayerRateLimitConfig(
    sourceLayer: InternalLayer,
    targetLayer: InternalLayer
  ): CrossLayerRateLimitConfig | null;

  /**
   * Gets layer dependency graph
   * 
   * @returns Layer dependency graph
   */
  getLayerDependencyGraph(): LayerDependencyGraph;

  /**
   * Adds layer dependency
   * 
   * @param source - Source layer
   * @param target - Target layer
   * @param weight - Dependency weight
   */
  addLayerDependency(source: InternalLayer, target: InternalLayer, weight: number): void;

  /**
   * Removes layer dependency
   * 
   * @param source - Source layer
   * @param target - Target layer
   */
  removeLayerDependency(source: InternalLayer, target: InternalLayer): void;

  /**
   * Gets layer health status
   * 
   * @param layer - Internal layer
   * @returns Layer health status
   */
  getLayerHealthStatus(layer: InternalLayer): LayerHealthStatus;

  /**
   * Gets health status for all layers
   * 
   * @returns Array of layer health statuses
   */
  getAllLayerHealthStatuses(): LayerHealthStatus[];

  /**
   * Sets rate limit cascade config
   * 
   * @param config - Rate limit cascade config
   */
  setRateLimitCascadeConfig(config: RateLimitCascadeConfig): void;

  /**
   * Gets rate limit cascade config
   * 
   * @returns Rate limit cascade config
   */
  getRateLimitCascadeConfig(): RateLimitCascadeConfig;

  /**
   * Sets adaptive rate limit config
   * 
   * @param config - Adaptive rate limit config
   */
  setAdaptiveRateLimitConfig(config: AdaptiveRateLimitConfig): void;

  /**
   * Gets adaptive rate limit config
   * 
   * @returns Adaptive rate limit config
   */
  getAdaptiveRateLimitConfig(): AdaptiveRateLimitConfig;

  /**
   * Predicts rate limit usage
   * 
   * @param identifier - Rate limit identifier
   * @param timeWindow - Time window for prediction
   * @returns Rate limit prediction
   */
  predictRateLimitUsage(
    identifier: RateLimitIdentifier,
    timeWindow: Date
  ): RateLimitPrediction;

  /**
   * Enables internal layer rate limiting
   * 
   * @param layer - Internal layer
   */
  enableInternalLayerRateLimiting(layer: InternalLayer): void;

  /**
   * Disables internal layer rate limiting
   * 
   * @param layer - Internal layer
   */
  disableInternalLayerRateLimiting(layer: InternalLayer): void;

  /**
   * Checks if internal layer rate limiting is enabled
   * 
   * @param layer - Internal layer
   * @returns True if enabled
   */
  isInternalLayerRateLimitingEnabled(layer: InternalLayer): boolean;

  /**
   * Resets rate limit for internal layer
   * 
   * @param layerIdentifier - Internal layer identifier
   */
  resetInternalLayerRateLimit(layerIdentifier: InternalLayerIdentifier): void;

  /**
   * Clears all internal layer buckets
   */
  clearAllInternalLayerBuckets(): void;
}
