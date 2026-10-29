/**
 * Event Strategy Interface
 *
 * Defines the contract for event execution strategies.
 * Each strategy encapsulates a specific approach to executing event operations.
 *
 * @module EventLayer/Strategies
 */

/**
 * Context object passed to event strategies during execution.
 * Contains all necessary information for the strategy to perform its operation.
 */
export interface EventStrategyContext {
  /** The event operation to execute (e.g., 'publish', 'subscribe', 'unsubscribe', 'emit') */
  readonly operation: string;
  /** The event name/type being operated on */
  readonly eventName: string;
  /** Optional event payload for publish/emit operations */
  readonly payload?: unknown;
  /** Optional handler for subscribe operations */
  readonly handler?: (payload: unknown) => void | Promise<void>;
  /** Optional subscription ID for unsubscribe operations */
  readonly subscriptionId?: string;
  /** Whether the subscription should be one-time */
  readonly once?: boolean;
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
export interface EventStrategyResult<T = unknown> {
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
    readonly subscriptionId?: string;
    readonly batched?: boolean;
    readonly batchSize?: number;
    readonly subscriberCount?: number;
    readonly cacheHit?: boolean;
    readonly filtered?: boolean;
    readonly queued?: boolean;
    readonly retryCount?: number;
    readonly deadLettered?: boolean;
    readonly deliveries?: unknown;
    readonly matchedRule?: string;
    readonly transformed?: boolean;
    readonly waitTimeMs?: number;
    readonly workerId?: unknown;
    readonly mode?: string;
  };
}

/**
 * Interface for event execution strategies.
 * Implementations define specific approaches to executing event operations.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export interface IEventStrategy<T = unknown> {
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
  canHandle(context: EventStrategyContext): boolean;

  /**
   * Executes the event operation using this strategy.
   *
   * @param context - The execution context containing operation details
   * @returns A promise resolving to the strategy result
   */
  execute(context: EventStrategyContext): Promise<EventStrategyResult<T>>;
}
