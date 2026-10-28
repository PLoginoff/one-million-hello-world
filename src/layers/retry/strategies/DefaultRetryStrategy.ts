/**
 * Default Retry Strategy
 *
 * Provides the base implementation for retry execution with exponential backoff,
 * jitter, and configurable retry policies.
 *
 * @module RetryLayer/Strategies
 */

import { IRetryStrategy, RetryContext, RetryStrategyResult } from './IRetryStrategy';
import { RetryConfig, RetryStrategy as RetryStrategyType } from '../types/retry-types';

/**
 * Default implementation of retry strategy
 *
 * @typeParam T - The type of result returned by the operation
 */
export class DefaultRetryStrategy<T = unknown> implements IRetryStrategy<T> {
  readonly name = 'default';
  readonly priority = 10;

  private _executionCount: number = 0;
  private _totalAttempts: number = 0;
  private _totalSuccesses: number = 0;
  private _totalFailures: number = 0;

  /**
   * Creates a new DefaultRetryStrategy
   */
  constructor() {
    // Initialize with default values
  }

  /**
   * Gets the total number of executions
   *
   * @returns Number of executions
   */
  getExecutionCount(): number {
    return this._executionCount;
  }

  /**
   * Gets the total number of attempts across all executions
   *
   * @returns Total attempts
   */
  getTotalAttempts(): number {
    return this._totalAttempts;
  }

  /**
   * Gets the total number of successful executions
   *
   * @returns Total successes
   */
  getTotalSuccesses(): number {
    return this._totalSuccesses;
  }

  /**
   * Gets the total number of failed executions
   *
   * @returns Total failures
   */
  getTotalFailures(): number {
    return this._totalFailures;
  }

  /**
   * Resets all counters
   */
  reset(): void {
    this._executionCount = 0;
    this._totalAttempts = 0;
    this._totalSuccesses = 0;
    this._totalFailures = 0;
  }

  /**
   * Calculates the delay before the next retry attempt
   *
   * @param attempt - Current attempt number (1-based)
   * @param config - Retry configuration
   * @param previousError - Previous error if any
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number, config: RetryConfig, previousError?: Error): number {
    let delay: number;

    switch (config.strategy) {
      case RetryStrategyType.EXPONENTIAL_BACKOFF:
        delay = config.baseDelay * Math.pow(2, attempt - 1);
        break;
      case RetryStrategyType.LINEAR_BACKOFF:
        delay = config.baseDelay * attempt;
        break;
      case RetryStrategyType.FIXED_DELAY:
      default:
        delay = config.baseDelay;
        break;
    }

    // Cap at max delay
    delay = Math.min(delay, config.maxDelay);

    // Apply jitter if enabled
    if (config.jitter) {
      // Full jitter: random value between 0 and delay
      delay = Math.floor(Math.random() * delay);
    }

    return delay;
  }

  /**
   * Determines if an error is retryable
   *
   * @param error - The error to evaluate
   * @param config - Retry configuration
   * @returns True if the error is retryable
   */
  protected isRetryable(error: Error, config: RetryConfig): boolean {
    // By default, retry on all errors
    // Subclasses can override to implement specific retry conditions
    return true;
  }

  /**
   * Executes an operation with retry logic
   *
   * @param context - Execution context
   * @returns Strategy execution result
   */
  async execute(context: RetryContext<T>): Promise<RetryStrategyResult<T>> {
    const startTime = Date.now();
    this._executionCount++;
    const delaysMs: number[] = [];
    let lastError: Error | undefined = context.previousError;
    let attempt = context.attempt;

    // If this is a fresh execution (attempt 1), start from 1
    if (attempt <= 1) {
      attempt = 1;
    }

    while (attempt <= context.config.maxAttempts) {
      this._totalAttempts++;

      try {
        const result = await context.operation();
        this._totalSuccesses++;

        return {
          success: true,
          data: result,
          attempts: attempt,
          durationMs: Date.now() - startTime,
          delaysMs,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (attempt < context.config.maxAttempts && this.isRetryable(lastError, context.config)) {
          const delay = this.calculateDelay(attempt, context.config, lastError);
          delaysMs.push(delay);

          // Wait for the delay
          await new Promise((resolve) => setTimeout(resolve, delay));

          attempt++;
        } else {
          // No more retries or not retryable
          break;
        }
      }
    }

    this._totalFailures++;

    return {
      success: false,
      error: lastError?.message ?? 'Operation failed after retries',
      attempts: attempt,
      durationMs: Date.now() - startTime,
      delaysMs,
    };
  }

  /**
   * Determines if this strategy can handle the given context
   *
   * @param context - Execution context to evaluate
   * @returns True if strategy can handle the context
   */
  canHandle(context: RetryContext<unknown>): boolean {
    return (
      context !== null &&
      context !== undefined &&
      typeof context.operation === 'function' &&
      context.config !== undefined &&
      context.config.maxAttempts > 0
    );
  }
}
