/**
 * MessageQueueDefaultStrategy
 *
 * Default strategy for message queue operations with standard processing.
 */

import { MessageQueueStrategyContext, MessageQueueStrategyResult, IMessageQueueStrategy } from '../types/message-queue-types';

/**
 * Base interface for message queue strategies
 */
export interface IMessageQueueStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: MessageQueueStrategyContext): Promise<MessageQueueStrategyResult>;
  canHandle(context: MessageQueueStrategyContext): boolean;
}

export class MessageQueueDefaultStrategy implements IMessageQueueStrategy {
  readonly name = 'default';
  readonly priority = 10;
  private _executionCount: number;
  private _successCount: number;
  private _failureCount: number;
  private _totalExecutionTime: number;

  constructor() {
    this._executionCount = 0;
    this._successCount = 0;
    this._failureCount = 0;
    this._totalExecutionTime = 0;
  }

  canHandle(context: MessageQueueStrategyContext): boolean {
    return context !== null && context !== undefined && context.operation !== undefined;
  }

  async execute(context: MessageQueueStrategyContext): Promise<MessageQueueStrategyResult> {
    const startTime = Date.now();
    this._executionCount++;

    try {
      // Simulate processing
      await Promise.resolve();

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
    };
  }

  reset(): void {
    this._executionCount = 0;
    this._successCount = 0;
    this._failureCount = 0;
    this._totalExecutionTime = 0;
  }
}