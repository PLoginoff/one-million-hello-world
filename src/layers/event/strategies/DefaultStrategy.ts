/**
 * EventDefaultStrategy
 *
 * Standard event strategy with balanced performance and reliability.
 * Provides a base implementation for all event operations.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Default event strategy implementation.
 * Handles all operations with a simple pass-through approach.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class EventDefaultStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'default';

  /** @inheritdoc */
  public readonly priority = 10;

  private _executionCount: number;

  /**
   * Creates a new EventDefaultStrategy instance.
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
      // In a real implementation, this would delegate to the actual event bus
      // For now, we simulate a successful operation
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