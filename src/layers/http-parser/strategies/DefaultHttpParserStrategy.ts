/**
 * Default HTTP Parser Strategy
 *
 * Standard HTTP parser strategy implementation with balanced performance.
 * Serves as the base implementation for other HTTP parser strategies.
 *
 * @module HttpParserLayer/Strategies
 */

import { IHttpParserStrategy, HttpParserStrategyContext, StrategyResult } from './IHttpParserStrategy';

/**
 * Default HTTP parser strategy implementation.
 * Provides basic HTTP parsing processing with execution tracking.
 */
export class DefaultHttpParserStrategy implements IHttpParserStrategy {
  /** Unique name identifying this strategy */
  readonly name = 'default-http-parser';

  /** Priority for strategy selection (higher = preferred) */
  readonly priority = 10;

  private executionCount: number;

  /**
   * Creates a new DefaultHttpParserStrategy instance.
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
  canHandle(context: HttpParserStrategyContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  /**
   * Executes the default HTTP parser strategy.
   *
   * @param context - The strategy context containing input and metadata
   * @returns Promise resolving to the strategy result with execution info
   */
  async execute(context: HttpParserStrategyContext): Promise<StrategyResult> {
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
