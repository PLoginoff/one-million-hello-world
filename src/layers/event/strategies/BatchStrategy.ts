/**
 * EventBatchStrategy
 *
 * Batch-oriented event strategy for bulk operations.
 * Accumulates events and processes them in batches for efficiency.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Configuration options for the batch strategy.
 */
export interface BatchStrategyConfig {
  /** Maximum number of events to accumulate before flushing */
  maxBatchSize: number;
  /** Maximum time to wait before flushing a partial batch (ms) */
  maxBatchWaitMs: number;
  /** Whether to process batches asynchronously */
  asyncProcessing: boolean;
  /** Maximum number of concurrent batch processing */
  maxConcurrentBatches: number;
}

/**
 * Default configuration for batch strategy.
 */
export const DEFAULT_BATCH_CONFIG: BatchStrategyConfig = {
  maxBatchSize: 100,
  maxBatchWaitMs: 5000,
  asyncProcessing: true,
  maxConcurrentBatches: 10,
};

/**
 * Batched event context.
 */
interface BatchedContext {
  context: EventStrategyContext;
  resolve: (result: EventStrategyResult<unknown>) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Batch event strategy implementation.
 * Accumulates events and processes them in batches.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class EventBatchStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'batch';

  /** @inheritdoc */
  public readonly priority = 3;

  private readonly _config: BatchStrategyConfig;
  private readonly _batchQueue: BatchedContext[] = [];
  private _flushTimer: ReturnType<typeof setTimeout> | null = null;
  private _processing = false;
  private _executionCount: number;
  private _batchCount: number;

  /**
   * Creates a new EventBatchStrategy instance.
   *
   * @param config - Optional configuration for batch behavior
   */
  constructor(config: Partial<BatchStrategyConfig> = {}) {
    this._config = { ...DEFAULT_BATCH_CONFIG, ...config };
    this._executionCount = 0;
    this._batchCount = 0;
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

    // For non-publish operations, execute directly
    if (context.operation !== 'publish' && context.operation !== 'emit') {
      return this._executeDirect(context, startTime);
    }

    // For publish/emit, queue for batching
    return new Promise((resolve, reject) => {
      this._batchQueue.push({
        context,
        resolve: resolve as (result: EventStrategyResult<unknown>) => void,
        reject,
        timestamp: Date.now(),
      });

      this._scheduleFlush();

      // If batch is full, flush immediately
      if (this._batchQueue.length >= this._config.maxBatchSize) {
        this._flush();
      }
    }) as Promise<EventStrategyResult<T>>;
  }

  /**
   * Executes a single context directly (non-batched).
   *
   * @param context - The execution context
   * @param startTime - Start time for metrics
   * @returns Strategy result
   */
  private async _executeDirect(
    context: EventStrategyContext,
    startTime: number
  ): Promise<EventStrategyResult<T>> {
    try {
      await Promise.resolve(); // Simulate actual operation

      const result: EventStrategyResult<T> = {
        success: true,
        data: undefined as T,
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          subscriptionId: context.subscriptionId,
          batched: false,
        },
      };

      this._executionCount++;
      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: { context },
        },
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          batched: false,
        },
      };
    }
  }

  /**
   * Schedules a batch flush.
   */
  private _scheduleFlush(): void {
    if (this._flushTimer) return;

    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._flush();
    }, this._config.maxBatchWaitMs);
  }

  /**
   * Flushes the current batch queue.
   */
  private async _flush(): Promise<void> {
    if (this._batchQueue.length === 0 || this._processing) return;

    if (this._config.maxConcurrentBatches > 0) {
      // Check if we're at max concurrent batches (simplified)
      this._processing = true;
    }

    const batch = this._batchQueue.splice(0, this._config.maxBatchSize);
    this._batchCount++;

    const batchStartTime = Date.now();

    try {
      // In a real implementation, this would batch the operations
      // For now, process each individually but track as a batch
      await Promise.resolve();

      const results = batch.map(({ context }) => ({
        success: true as const,
        data: undefined as T,
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - batchStartTime,
          timestamp: Date.now(),
          subscriptionId: context.subscriptionId,
          batched: true,
          batchId: this._batchCount,
        },
      }));

      for (let i = 0; i < batch.length; i++) {
        batch[i].resolve(results[i]);
        this._executionCount++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      for (const item of batch) {
        item.reject(new Error(errorMessage));
      }
    } finally {
      this._processing = false;
    }
  }

  /**
   * Forces a flush of any pending batch.
   */
  public async flush(): Promise<void> {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    await this._flush();
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
   * Gets the number of batches processed.
   *
   * @returns The batch count
   */
  public getBatchCount(): number {
    return this._batchCount;
  }

  /**
   * Gets the current queue size.
   *
   * @returns The number of pending events in the queue
   */
  public getQueueSize(): number {
    return this._batchQueue.length;
  }

  /**
   * Gets the current configuration.
   *
   * @returns The configuration
   */
  public getConfig(): BatchStrategyConfig {
    return { ...this._config };
  }
}