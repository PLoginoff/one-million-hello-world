/**
 * Retry Service Strategy
 *
 * Decorates a service strategy with retry logic using exponential backoff.
 * Retries failed executions up to a maximum number of attempts.
 *
 * @module ServiceLayer/Strategies
 */

import { IServiceStrategy } from './IServiceStrategy';
import { ServiceContext } from '../types/service-types';
import { ServiceResult } from '../types/service-types';

/**
 * Configuration options for retry behavior.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff (default: 100) */
  baseDelayMs: number;
  /** Maximum delay in milliseconds between retries (default: 5000) */
  maxDelayMs: number;
  /** Function to determine if an error is retryable (default: all errors retryable) */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Metrics collected by the retry strategy.
 */
export interface RetryMetrics {
  /** Total number of execution attempts (including retries) */
  totalAttempts: number;
  /** Number of retry attempts made */
  totalRetries: number;
  /** Number of executions that succeeded after at least one retry */
  successfulAfterRetry: number;
  /** Number of executions that exhausted all retries */
  exhaustedRetries: number;
}

/**
 * Default retry options.
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
};

/**
 * Retry service strategy that wraps another strategy with retry logic.
 */
export class RetryServiceStrategy<TInput = unknown, TOutput = unknown> implements IServiceStrategy<TInput, TOutput> {
  private readonly _inner: IServiceStrategy<TInput, TOutput>;
  private readonly _options: RetryOptions;
  private _metrics: RetryMetrics;

  /**
   * Creates a new RetryServiceStrategy instance.
   *
   * @param inner - The strategy to wrap with retry logic
   * @param options - Optional retry configuration
   */
  constructor(inner: IServiceStrategy<TInput, TOutput>, options?: Partial<RetryOptions>) {
    this._inner = inner;
    this._options = { ...DEFAULT_RETRY_OPTIONS, ...options };
    this._metrics = {
      totalAttempts: 0,
      totalRetries: 0,
      successfulAfterRetry: 0,
      exhaustedRetries: 0,
    };
  }

  /**
   * Gets the strategy name, including the wrapped strategy name.
   *
   * @returns The combined strategy name
   */
  getName(): string {
    return `RETRY(${this._inner.getName()})`;
  }

  /**
   * Gets the strategy priority from the wrapped strategy.
   *
   * @returns The wrapped strategy's priority
   */
  getPriority(): number {
    return this._inner.getPriority();
  }

  /**
   * Executes the wrapped strategy with retry logic.
   *
   * @param input - The input data for the service operation
   * @param context - The service execution context
   * @returns Promise resolving to the service result
   */
  async execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this._options.maxRetries; attempt++) {
      this._metrics.totalAttempts++;

      try {
        const result = await this._inner.execute(input, context);

        if (attempt > 0) {
          this._metrics.successfulAfterRetry++;
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const isRetryable = this._options.isRetryable?.(lastError) ?? true;

        if (attempt < this._options.maxRetries && isRetryable) {
          this._metrics.totalRetries++;
          const delay = this._computeDelay(attempt);
          await this._sleep(delay);
        } else {
          // Not retryable or max retries reached
          break;
        }
      }
    }

    this._metrics.exhaustedRetries++;

    // Return error result instead of throwing to maintain ServiceResult pattern
    return {
      success: false,
      error: {
        code: 'RETRY_EXHAUSTED',
        message: `Operation failed after ${this._metrics.totalAttempts} attempts`,
        details: {
          attempts: this._metrics.totalAttempts,
          maxRetries: this._options.maxRetries,
          lastError: lastError?.message,
        },
      },
    };
  }

  /**
   * Computes the delay for the given attempt using exponential backoff.
   *
   * @param attempt - The current attempt number (0-based)
   * @returns Delay in milliseconds
   */
  private _computeDelay(attempt: number): number {
    const delay = this._options.baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, this._options.maxDelayMs);
  }

  /**
   * Sleeps for the specified duration.
   *
   * @param ms - Duration in milliseconds
   * @returns Promise that resolves after the duration
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Gets the current retry metrics.
   *
   * @returns Copy of the current metrics
   */
  getMetrics(): RetryMetrics {
    return { ...this._metrics };
  }

  /**
   * Resets all collected metrics.
   */
  resetMetrics(): void {
    this._metrics = {
      totalAttempts: 0,
      totalRetries: 0,
      successfulAfterRetry: 0,
      exhaustedRetries: 0,
    };
  }
}
