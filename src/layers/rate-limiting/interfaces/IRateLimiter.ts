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
}
