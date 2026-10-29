/**
 * EventFastStrategy
 *
 * High-performance event strategy optimized for speed.
 * Minimizes overhead for latency-sensitive operations.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Fast event strategy implementation.
 * Optimized for low-latency event operations.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class EventFastStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'fast';

  /** @inheritdoc */
  public readonly priority = 20;

  private _executionCount: number;

  /**
   * Creates a new EventFastStrategy instance.
   */
  constructor() {
    this._executionCount = 0;
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

    try {
      // Fast path: minimal overhead, direct execution
      // In a real implementation, this would use optimized paths
      await Promise.resolve();

      const result: EventStrategyResult<T> = {
        success: true,
        data: undefined as T,
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          subscriptionId: context.subscriptionId,
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
        },
      };
    }
  }

  /**
   * Gets the number of times this strategy has been executed.
   *
   * @returns The execution count
   */
  public getExecutionCount(): number {
    return this._executionCount;
  }
}