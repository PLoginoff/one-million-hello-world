/**
 * Repository Strategy Interface
 *
 * Defines the contract for repository execution strategies.
 * Each strategy encapsulates a specific approach to executing repository operations.
 *
 * @module RepositoryLayer/Strategies
 */

/**
 * Context object passed to repository strategies during execution.
 * Contains all necessary information for the strategy to perform its operation.
 */
export interface RepositoryStrategyContext {
  /** The repository operation to execute (e.g., 'find', 'save', 'delete', 'query') */
  readonly operation: string;
  /** The entity type or collection name being operated on */
  readonly entityType: string;
  /** Optional query parameters for find/query operations */
  readonly query?: Record<string, unknown>;
  /** Optional data payload for create/update operations */
  readonly payload?: Record<string, unknown>;
  /** Optional identifier for single-entity operations */
  readonly id?: string | number;
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
export interface RepositoryStrategyResult<T = unknown> {
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
  };
}

/**
 * Interface for repository execution strategies.
 * Implementations define specific approaches to executing repository operations.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export interface IRepositoryStrategy<T = unknown> {
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
  canHandle(context: RepositoryStrategyContext): boolean;

  /**
   * Executes the repository operation using this strategy.
   *
   * @param context - The execution context containing operation details
   * @returns A promise resolving to the strategy result
   */
  execute(context: RepositoryStrategyContext): Promise<RepositoryStrategyResult<T>>;
}
