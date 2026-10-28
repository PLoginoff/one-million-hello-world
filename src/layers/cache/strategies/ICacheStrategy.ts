/**
 * Cache Strategy Interface
 *
 * Defines the contract for cache execution strategies.
 * Each strategy encapsulates a specific approach to executing cache operations.
 *
 * @module CacheLayer/Strategies
 */

/**
 * Context object passed to cache strategies during execution.
 * Contains all necessary information for the strategy to perform its operation.
 */
export interface CacheStrategyContext {
  /** The cache operation to execute (e.g., 'get', 'set', 'delete', 'clear', 'invalidate') */
  readonly operation: string;
  /** The cache key being operated on */
  readonly key: string;
  /** Optional value for set operations */
  readonly value?: unknown;
  /** Optional TTL in milliseconds for set operations */
  readonly ttl?: number;
  /** Optional cache level (L1, L2, L3) */
  readonly level?: string;
  /** Additional metadata for the strategy */
  readonly metadata?: Record<string, unknown>;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Timestamp when the operation was initiated */
  readonly timestamp: number;
}

/**
 * Result of a strategy execution.
 */
export interface CacheStrategyResult<T = unknown> {
  /** Whether the operation succeeded */
  readonly success: boolean;
  /** The result data if successful */
  readonly data?: T;
  /** Error information if failed */
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
  /** Execution metadata */
  readonly metadata?: {
    readonly strategyName: string;
    readonly executionTimeMs: number;
    readonly timestamp: number;
    readonly cacheLevel?: string;
    readonly hit?: boolean;
  };
}

/**
 * Interface for cache execution strategies.
 * Implementations define specific approaches to executing cache operations.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export interface ICacheStrategy<T = unknown> {
  /** Unique name identifying this strategy */
  readonly name: string;
  /** Priority for strategy selection (higher = preferred) */
  readonly priority: number;

  /**
   * Determines if this strategy can handle the given context.
   *
   * @param context - The execution context to evaluate
   * @returns True if this strategy can handle the context, false otherwise
   */
  canHandle(context: CacheStrategyContext): boolean;

  /**
   * Executes the cache operation using this strategy.
   *
   * @param context - The execution context containing operation details
   * @returns A promise resolving to the strategy result
   */
  execute(context: CacheStrategyContext): Promise<CacheStrategyResult<T>>;
}
