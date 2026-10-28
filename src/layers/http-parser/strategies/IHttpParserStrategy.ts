/**
 * HTTP Parser Strategy Interface
 *
 * Defines the contract for HTTP parser strategy implementations.
 * All HTTP parser strategies must implement this interface.
 *
 * @module HttpParserLayer/Strategies
 */

/**
 * Result of a strategy execution.
 */
export interface StrategyResult<T = unknown> {
  /** Whether the execution was successful */
  success: boolean;
  /** The result data on success */
  data?: T;
  /** Error information on failure */
  error?: {
    /** Error code */
    code: string;
    /** Human-readable error message */
    message: string;
  };
}

/**
 * Context passed to HTTP parser strategy execute method.
 */
export interface HttpParserStrategyContext {
  /** The input data to process */
  input: unknown;
  /** Optional metadata about the request */
  metadata?: Record<string, unknown>;
  /** Optional correlation ID for tracing */
  correlationId?: string;
}

/**
 * Interface for HTTP parser strategies.
 * Provides a standardized way to execute HTTP parsing operations.
 */
export interface IHttpParserStrategy {
  /** Unique name identifying this strategy */
  readonly name: string;
  /** Priority for strategy selection (higher = preferred) */
  readonly priority: number;

  /**
   * Determines if this strategy can handle the given context.
   *
   * @param context - The strategy context to evaluate
   * @returns True if this strategy can handle the context
   */
  canHandle(context: HttpParserStrategyContext): boolean;

  /**
   * Executes the HTTP parser strategy with the given context.
   *
   * @param context - The strategy context containing input and metadata
   * @returns Promise resolving to the strategy result
   */
  execute(context: HttpParserStrategyContext): Promise<StrategyResult>;
}
