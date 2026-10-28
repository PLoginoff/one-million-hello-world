/**
 * MessageQueueBatchStrategy
 *
 * Batch strategy for message queue operations with batch processing support.
 */

import { MessageQueueStrategyContext, MessageQueueStrategyResult, IMessageQueueStrategy, BatchEnqueueOptions, BatchEnqueueResult } from '../types/message-queue-types';

export class MessageQueueBatchStrategy implements IMessageQueueStrategy {
  readonly name = 'batch';
  readonly priority = 3;
  private _executionCount: number;
  private _successCount: number;
  private _failureCount: number;
  private _totalExecutionTime: number;
  private _batchSize: number;
  private _batchTimeout: number;

  constructor(batchSize: number = 100, batchTimeout: number = 1000) {
    this._executionCount = 0;
    this._successCount = 0;
    this._failureCount = 0;
    this._totalExecutionTime = 0;
    this._batchSize = batchSize;
    this._batchTimeout = batchTimeout;
  }

  canHandle(context: MessageQueueStrategyContext): boolean {
    return context !== null && context !== undefined && context.operation !== undefined;
  }

  async execute(context: MessageQueueStrategyContext): Promise<MessageQueueStrategyResult> {
    const startTime = Date.now();
    this._executionCount++;

    try {
      // Check if this is a batch operation
      if (context.operation === 'batch_enqueue' && context.metadata?.batchOptions) {
        const result = await this._executeBatch(context.metadata.batchOptions as BatchEnqueueOptions);

        const executionTime = Date.now() - startTime;
        this._successCount++;
        this._totalExecutionTime += executionTime;

        return {
          success: result.success,
          data: {
            strategy: this.name,
            operation: context.operation,
            executionCount: this._executionCount,
            batchResults: result.results,
            errors: result.errors,
          },
          metadata: {
            executionTimeMs: executionTime,
            timestamp: Date.now(),
            batchSize: result.results.length,
          },
        };
      }

      // Single operation
      const result = await this._processSingleOperation(context);

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
        },
        metadata: {
          executionTimeMs: executionTime,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      this._failureCount++;
      return {
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
        },
      };
    }
  }

  private async _processSingleOperation(context: MessageQueueStrategyContext): Promise<void> {
    // Simulate processing
    await Promise.resolve();
  }

  private async _executeBatch(options: BatchEnqueueOptions): Promise<BatchEnqueueResult> {
    const results: Array<{ success: boolean; messageId?: string; error?: string }> = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < options.messages.length; i++) {
      const message = options.messages[i];

      try {
        // Simulate enqueue
        await Promise.resolve();
        results.push({ success: true, messageId: `batch-msg-${Date.now()}-${i}` });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ success: false, error: errorMessage });
        errors.push({ index: i, error: errorMessage });

        if (options.stopOnError) {
          break;
        }
      }
    }

    return {
      success: errors.length === 0,
      results,
      errors,
    };
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
      batchSize: this._batchSize,
      batchTimeout: this._batchTimeout,
    };
  }

  setBatchSize(size: number): void {
    this._batchSize = size;
  }

  setBatchTimeout(timeout: number): void {
    this._batchTimeout = timeout;
  }

  reset(): void {
    this._executionCount = 0;
    this._successCount = 0;
    this._failureCount = 0;
    this._totalExecutionTime = 0;
  }
}