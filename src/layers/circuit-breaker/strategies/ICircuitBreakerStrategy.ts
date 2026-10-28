/**
 * Circuit Breaker Strategy Interface
 *
 * Defines the contract for circuit breaker execution strategies.
 * Implementations provide different approaches to executing operations
 * with circuit breaker protection.
 *
 * @module CircuitBreakerLayer/Strategies
 */

import { CircuitConfig, CircuitState, CircuitResult } from '../types/circuit-breaker-types';

/**
 * Context object for circuit breaker strategy execution
 */
export interface CircuitBreakerContext<T> {
  /** The operation to execute */
  operation: () => T | Promise<T>;
  /** Optional fallback function */
  fallback?: () => T | Promise<T>;
  /** Current circuit configuration */
  config: CircuitConfig;
  /** Current circuit state */
  state: CircuitState;
  /** Circuit statistics */
  stats: {
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  };
}

/**
 * Result of circuit breaker strategy execution
 */
export interface CircuitBreakerStrategyResult<T> {
  /** Whether the execution was successful */
  success: boolean;
  /** The result data if successful */
  data?: T;
  /** The circuit state after execution */
  state: CircuitState;
  /** Error message if failed */
  error?: string;
  /** Number of attempts made */
  attempts: number;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Interface for circuit breaker execution strategies
 *
 * @typeParam T - The type of result returned by the operation
 */
export interface ICircuitBreakerStrategy<T = unknown> {
  /** Unique strategy name */
  readonly name: string;
  /** Strategy priority (higher = more preferred) */
  readonly priority: number;

  /**
   * Executes an operation with circuit breaker protection
   *
   * @param context - Execution context containing operation, config, and state
   * @returns Strategy execution result
   */
  execute(context: CircuitBreakerContext<T>): Promise<CircuitBreakerStrategyResult<T>>;

  /**
   * Determines if this strategy can handle the given context
   *
   * @param context - Execution context to evaluate
   * @returns True if strategy can handle the context
   */
  canHandle(context: CircuitBreakerContext<unknown>): boolean;
}
