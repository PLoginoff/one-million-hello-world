/**
 * Default Cache Strategy
 *
 * Provides a base implementation of the cache strategy interface.
 * This strategy serves as the fallback for all cache operations.
 *
 * @module CacheLayer/Strategies
 */

import type { ICacheStrategy, CacheStrategyContext, CacheStrategyResult } from './ICacheStrategy';

/**
 * Base implementation of the cache strategy.
 * Handles all operations with a simple pass-through approach.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class DefaultCacheStrategy<T = unknown> implements ICacheStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'default-cache';

  /** @inheritdoc */
  public readonly priority = 10;

  private readonly _executionCount: number;

  /**
   * Creates a new DefaultCacheStrategy instance.
   */
  constructor() {
    this._executionCount = 0;
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: CacheStrategyContext): boolean {
    return (
      context !== null &&
      context !== undefined &&
      typeof context.operation === 'string' &&
      context.operation.length > 0 &&
      typeof context.key === 'string' &&
      context.key.length > 0
    );
  }

  /**
   * @inheritdoc
   */
  public async execute(context: CacheStrategyContext): Promise<CacheStrategyResult<T>> {
    const startTime = Date.now();

    try {
      // In a real implementation, this would delegate to the actual cache
      // For now, we simulate a successful operation
      await Promise.resolve();

      const result: CacheStrategyResult<T> = {
        success: true,
        data: undefined as T,
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          cacheLevel: context.level,
          hit: context.operation === 'get',
        },
      };

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
