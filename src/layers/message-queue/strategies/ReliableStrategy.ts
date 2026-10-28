/**
 * MessageQueueReliableStrategy
 *
 * Reliable strategy for message queue operations with retry logic and error handling.
 */

import { MessageQueueStrategyContext, MessageQueueStrategyResult, IMessageQueueStrategy, RetryPolicy, DEFAULT_RETRY_POLICY } from '../types/message-queue-types';

export class MessageQueueReliableStrategy implements IMessageQueueStrategy {
  readonly name = 'reliable';
  readonly priority = 5;
  private _executionCount: number;
  private _successCount: number;
  private _failureCount: number;
  private _totalExecutionTime: number;
  private _retryPolicy: RetryPolicy;

  constructor(retryPolicy?: Partial<RetryPolicy>) {
    this._executionCount = 0;
    this._successCount = 0;
    this._failureCount = 0;
    this._totalExecutionTime = 0;
    this._retryPolicy = { ...DEFAULT_RETRY_POLICY, ...retryPolicy };
  }

  canHandle(context: MessageQueueStrategyContext): boolean {
    return context !== null && context !== undefined && context.operation !== undefined;
  }

  async execute(context: MessageQueueStrategyContext): Promise<MessageQueueStrategyResult> {
    const startTime = Date.now();
    this._executionCount++;

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= this._retryPolicy.maxAttempts) {
      try {
        // Simulate processing with potential failure
        await this._processWithReliability(context);

        const executionTime = Date.now() - startTime;
        this._successCount++;
        this._totalExecutionTime += executionTime;

        return {
          success: true,
          data: {
            strategy: this.name,
            operation: context.operation,
            executionCount: this._executionCount,
            queueSize: context.queueSize,
            attempts: attempt + 1,
          },
          metadata: {
            executionTimeMs: executionTime,
            timestamp: Date.now(),
            retryCount: attempt,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (attempt <= this._retryPolicy.maxAttempts) {
          const delay = this._calculateDelay(attempt);
          await this._delay(delay);
        }
      }
    }

    // All retries exhausted
    this._failureCount++;
    return {
      success: false,
      error: {
        code: 'MAX_RETRIES_EXCEEDED',
        message: lastError?.message ?? 'Max retries exceeded',
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        timestamp: Date.now(),
        retryCount: attempt - 1,
      },
    };
  }

  private async _processWithReliability(context: MessageQueueStrategyContext): Promise<void> {
    // Simulate reliable processing
    await Promise.resolve();

    // Simulate occasional failures for testing
    if (Math.random() < 0.1) {
      throw new Error('Simulated processing failure');
    }
  }

  private _calculateDelay(attempt: number): number {
    const { baseDelayMs, maxDelayMs, backoffMultiplier, jitter } = this._retryPolicy;
    let delay = Math.min(baseDelayMs * Math.pow(backoffMultiplier, attempt - 1), maxDelayMs);

    if (jitter) {
      delay = delay * (0.5 + Math.random() * 0.5); // 50-100% of calculated delay
    }

    return delay;
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getExecutionCount(): number {
    return this._executionCount;
  }

  getSuccessCount(): number {
    return this._successCount;
  }

  getFailureCount(): number {
    return this._failureCount;
  }

  getAverageExecutionTime(): number {
    return this._executionCount > 0 ? this._totalExecutionTime / this._executionCount : 0;
  }

  getMetrics() {
    return {
      executionCount: this._executionCount,
      successCount: this._successCount,
      failureCount: this._failureCount,
      averageExecutionTime: this.getAverageExecutionTime(),
      retryPolicy: this._retryPolicy,
    };
  }

  getRetryPolicy(): RetryPolicy {
    return { ...this._retryPolicy };
  }

  setRetryPolicy(policy: Partial<RetryPolicy>): void {
    this._retryPolicy = { ...this._retryPolicy, ...policy };
  }

  reset(): void {
    this._executionCount = 0;
    this._successCount = 0;
    this._failureCount = 0;
    this._totalExecutionTime = 0;
  }
}