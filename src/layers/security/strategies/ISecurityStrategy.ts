/**
 * Security Strategy Interface
 *
 * Defines the contract for security strategy implementations.
 * All security strategies must implement this interface.
 *
 * @module SecurityLayer/Strategies
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
 * Context passed to security strategy execute method.
 */
export interface SecurityStrategyContext {
  /** The input data to process */
  input: unknown;
  /** Optional metadata about the request */
  metadata?: Record<string, unknown>;
  /** Optional correlation ID for tracing */
  correlationId?: string;
}

/**
 * Interface for security strategies.
 * Provides a standardized way to execute security operations.
 */
export interface ISecurityStrategy {
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
  canHandle(context: SecurityStrategyContext): boolean;

  /**
   * Executes the security strategy with the given context.
   *
   * @param context - The strategy context containing input and metadata
   * @returns Promise resolving to the strategy result
   */
  execute(context: SecurityStrategyContext): Promise<StrategyResult>;
}
