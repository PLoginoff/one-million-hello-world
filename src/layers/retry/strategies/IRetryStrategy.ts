/**
 * Retry Strategy Interface
 *
 * Defines the contract for retry execution strategies.
 * Implementations provide different approaches to executing operations
 * with retry logic including backoff, jitter, and idempotency.
 *
 * @module RetryLayer/Strategies
 */

import { RetryConfig, RetryStrategy } from '../types/retry-types';

/**
 * Context object for retry strategy execution
 */
export interface RetryContext<T> {
  /** The operation to execute */
  operation: () => T | Promise<T>;
  /** Retry configuration */
  config: RetryConfig;
  /** Current attempt number (1-based) */
  attempt: number;
  /** Previous error if any */
  previousError?: Error;
  /** Whether the operation is idempotent */
  idempotent: boolean;
}

/**
 * Result of retry strategy execution
 */
export interface RetryStrategyResult<T> {
  /** Whether the execution was successful */
  success: boolean;
  /** The result data if successful */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Number of attempts made */
  attempts: number;
  /** Total execution duration in milliseconds */
  durationMs: number;
  /** Delays applied between attempts in milliseconds */
  delaysMs: number[];
}

/**
 * Interface for retry execution strategies
 *
 * @typeParam T - The type of result returned by the operation
 */
export interface IRetryStrategy<T = unknown> {
  /** Unique strategy name */
  readonly name: string;
  /** Strategy priority (higher = more preferred) */
  readonly priority: number;

  /**
   * Executes an operation with retry logic
   *
   * @param context - Execution context containing operation, config, and attempt info
   * @returns Strategy execution result
   */
  execute(context: RetryContext<T>): Promise<RetryStrategyResult<T>>;

  /**
   * Determines if this strategy can handle the given context
   *
   * @param context - Execution context to evaluate
   * @returns True if strategy can handle the context
   */
  canHandle(context: RetryContext<unknown>): boolean;

  /**
   * Calculates the delay before the next retry attempt
   *
   * @param attempt - Current attempt number (1-based)
   * @param config - Retry configuration
   * @param previousError - Previous error if any
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number, config: RetryConfig, previousError?: Error): number;
}
