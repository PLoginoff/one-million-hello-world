/**
 * Router Strategy Interface
 *
 * Defines the contract for router execution strategies.
 * Strategies encapsulate different routing algorithms and behaviors.
 *
 * @module RouterLayer/Strategies
 */

/**
 * Context passed to router strategies during execution.
 */
export interface RouterStrategyContext {
  /** The HTTP method of the request */
  readonly method: string;
  /** The request path */
  readonly path: string;
  /** Optional query parameters */
  readonly query?: Record<string, string>;
  /** Optional headers */
  readonly headers?: Record<string, string>;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Timestamp when the request was received */
  readonly timestamp: number;
}

/**
 * Result of a router strategy execution.
 */
export interface RouterStrategyResult {
  /** Whether the routing was successful */
  readonly success: boolean;
  /** The matched route, if any */
  readonly route?: {
    readonly handler: string;
    readonly parameters: Record<string, string>;
    readonly middleware: string[];
  };
  /** Error information if routing failed */
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
  /** Execution metadata */
  readonly metadata?: {
    readonly strategyName: string;
    readonly executionTimeMs: number;
    readonly routesEvaluated: number;
  };
}

/**
 * Interface for router execution strategies.
 *
 * Implementations provide different routing algorithms (trie-based, regex, sequential, etc.)
 * and can be composed with decorators for logging, metrics, caching, etc.
 */
export interface IRouterStrategy {
  /** Unique name identifying this strategy */
  readonly name: string;
  /** Priority for strategy selection (higher = preferred) */
  readonly priority: number;

  /**
   * Execute the routing strategy.
   *
   * @param context - The routing context containing request details
   * @returns Promise resolving to the routing result
   */
  execute(context: RouterStrategyContext): Promise<RouterStrategyResult>;

  /**
   * Determine if this strategy can handle the given context.
   *
   * @param context - The routing context to evaluate
   * @returns True if this strategy can handle the context
   */
  canHandle(context: RouterStrategyContext): boolean;
}
