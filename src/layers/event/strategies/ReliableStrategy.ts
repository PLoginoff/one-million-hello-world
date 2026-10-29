/**
 * EventReliableStrategy
 *
 * Reliability-focused event strategy with retries and error handling.
 * Ensures event delivery even under adverse conditions.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Configuration options for the reliable strategy.
 */
export interface ReliableStrategyConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay between retries in milliseconds */
  baseRetryDelayMs: number;
  /** Maximum delay between retries in milliseconds */
  maxRetryDelayMs: number;
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean;
  /** Timeout for each attempt in milliseconds */
  attemptTimeoutMs: number;
}

/**
 * Default configuration for reliable strategy.
 */
export const DEFAULT_RELIABLE_CONFIG: ReliableStrategyConfig = {
  maxRetries: 3,
  baseRetryDelayMs: 100,
  maxRetryDelayMs: 5000,
  exponentialBackoff: true,
  attemptTimeoutMs: 5000,
};

/**
 * Reliable event strategy implementation.
 * Provides retry logic and error recovery for event operations.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class EventReliableStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'reliable';

  /** @inheritdoc */
  public readonly priority = 5;

  private readonly _config: ReliableStrategyConfig;
  private _executionCount: number;
  private _retryCount: number;

  /**
   * Creates a new EventReliableStrategy instance.
   *
   * @param config - Optional configuration for retry behavior
   */
  constructor(config: Partial<ReliableStrategyConfig> = {}) {
    this._config = { ...DEFAULT_RELIABLE_CONFIG, ...config };
    this._executionCount = 0;
    this._retryCount = 0;
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: EventStrategyContext): boolean {
    return (
      context !== null &&
      context !== undefined &&
      typeof context.operation === 'string' &&
      context.operation.length > 0 &&
      typeof context.eventName === 'string' &&
      context.eventName.length > 0
    );
  }

  /**
   * @inheritdoc
   */
  public async execute(context: EventStrategyContext): Promise<EventStrategyResult<T>> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this._config.maxRetries; attempt++) {
      try {
        // In a real implementation, this would delegate to the actual event bus
        // with timeout and retry logic
        await this._executeWithTimeout(context, this._config.attemptTimeoutMs);

        const result: EventStrategyResult<T> = {
          success: true,
          data: undefined as T,
          metadata: {
            strategyName: this.name,
            executionTimeMs: Date.now() - startTime,
            timestamp: Date.now(),
            subscriptionId: context.subscriptionId,
            retryCount: this._retryCount,
          },
        };

        this._executionCount++;
        this._retryCount = 0;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this._retryCount++;

        if (attempt < this._config.maxRetries) {
          const delay = this._calculateDelay(attempt);
          await this._sleep(delay);
        }
      }
    }

    // All retries exhausted
    return {
      success: false,
      error: {
        code: 'MAX_RETRIES_EXCEEDED',
        message: `Failed after ${this._config.maxRetries + 1} attempts: ${lastError?.message}`,
        details: { context, retryCount: this._retryCount, lastError: lastError?.message },
      },
      metadata: {
        strategyName: this.name,
        executionTimeMs: Date.now() - startTime,
        timestamp: Date.now(),
        retryCount: this._retryCount,
      },
    };
  }

  /**
   * Executes the operation with a timeout.
   *
   * @param context - The execution context
   * @param timeoutMs - Timeout in milliseconds
   */
  private async _executeWithTimeout(context: EventStrategyContext, timeoutMs: number): Promise<void> {
    const operationPromise = Promise.resolve(); // Simulate actual operation
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
    );

    await Promise.race([operationPromise, timeoutPromise]);
  }

  /**
   * Calculates the delay for the next retry attempt.
   *
   * @param attempt - The current attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  private _calculateDelay(attempt: number): number {
    if (this._config.exponentialBackoff) {
      const delay = this._config.baseRetryDelayMs * Math.pow(2, attempt);
      return Math.min(delay, this._config.maxRetryDelayMs);
    }
    return this._config.baseRetryDelayMs;
  }

  /**
   * Sleeps for the specified duration.
   *
   * @param ms - Duration in milliseconds
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Gets the number of times this strategy has been executed.
   *
   * @returns The execution count
   */
  public getExecutionCount(): number {
    return this._executionCount;
  }

  /**
   * Gets the number of retries in the last execution.
   *
   * @returns The retry count
   */
  public getRetryCount(): number {
    return this._retryCount;
  }

  /**
   * Gets the current configuration.
   *
   * @returns The configuration
   */
  public getConfig(): ReliableStrategyConfig {
    return { ...this._config };
  }
}