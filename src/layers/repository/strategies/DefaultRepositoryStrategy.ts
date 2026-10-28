/**
 * Default Repository Strategy
 *
 * Provides a base implementation of the repository strategy interface.
 * This strategy serves as the fallback for all repository operations.
 *
 * @module RepositoryLayer/Strategies
 */

import type { IRepositoryStrategy, RepositoryStrategyContext, RepositoryStrategyResult } from './IRepositoryStrategy';

/**
 * Base implementation of the repository strategy.
 * Handles all operations with a simple pass-through approach.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class DefaultRepositoryStrategy<T = unknown> implements IRepositoryStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'default-repository';

  /** @inheritdoc */
  public readonly priority = 10;

  private readonly _executionCount: number;

  /**
   * Creates a new DefaultRepositoryStrategy instance.
   */
  constructor() {
    this._executionCount = 0;
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: RepositoryStrategyContext): boolean {
    return (
      context !== null &&
      context !== undefined &&
      typeof context.operation === 'string' &&
      context.operation.length > 0 &&
      typeof context.entityType === 'string' &&
      context.entityType.length > 0
    );
  }

  /**
   * @inheritdoc
   */
  public async execute(context: RepositoryStrategyContext): Promise<RepositoryStrategyResult<T>> {
    const startTime = Date.now();

    try {
      // In a real implementation, this would delegate to the actual repository
      // For now, we simulate a successful operation
      await Promise.resolve();

      const result: RepositoryStrategyResult<T> = {
        success: true,
        data: undefined as T,
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
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
