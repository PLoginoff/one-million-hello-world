/**
 * Default Rate Limiting Strategy
 *
 * Standard rate limiting strategy implementation with balanced performance.
 * Serves as the base implementation for other rate limiting strategies.
 *
 * @module RateLimitingLayer/Strategies
 */

import { IRateLimitingStrategy, RateLimitingStrategyContext, StrategyResult } from './IRateLimitingStrategy';

/**
 * Default rate limiting strategy implementation.
 * Provides basic rate limiting processing with execution tracking.
 */
export class DefaultRateLimitingStrategy implements IRateLimitingStrategy {
  /** Unique name identifying this strategy */
  readonly name = 'default-rate-limiting';

  /** Priority for strategy selection (higher = preferred) */
  readonly priority = 10;

  private executionCount: number;

  /**
   * Creates a new DefaultRateLimitingStrategy instance.
   */
  constructor() {
    this.executionCount = 0;
  }

  /**
   * Determines if this strategy can handle the given context.
   *
   * @param context - The strategy context to evaluate
   * @returns True if the context has valid input
   */
  canHandle(context: RateLimitingStrategyContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  /**
   * Executes the default rate limiting strategy.
   *
   * @param context - The strategy context containing input and metadata
   * @returns Promise resolving to the strategy result with execution info
   */
  async execute(context: RateLimitingStrategyContext): Promise<StrategyResult> {
    this.executionCount++;
    await Promise.resolve(); // Simulate async work

    return {
      success: true,
      data: {
        strategy: this.name,
        input: context.input,
        metadata: context.metadata,
        correlationId: context.correlationId,
        executionCount: this.executionCount,
      },
    };
  }

  /**
   * Gets the number of times this strategy has been executed.
   *
   * @returns The execution count
   */
  getExecutionCount(): number {
    return this.executionCount;
  }
}
