/**
 * Default Security Strategy
 *
 * Standard security strategy implementation with balanced performance.
 * Serves as the base implementation for other security strategies.
 *
 * @module SecurityLayer/Strategies
 */

import { ISecurityStrategy, SecurityStrategyContext, StrategyResult } from './ISecurityStrategy';

/**
 * Default security strategy implementation.
 * Provides basic security processing with execution tracking.
 */
export class DefaultSecurityStrategy implements ISecurityStrategy {
  /** Unique name identifying this strategy */
  readonly name = 'default-security';

  /** Priority for strategy selection (higher = preferred) */
  readonly priority = 0;

  private executionCount: number;

  /**
   * Creates a new DefaultSecurityStrategy instance.
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
  canHandle(context: SecurityStrategyContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  /**
   * Executes the default security strategy.
   *
   * @param context - The strategy context containing input and metadata
   * @returns Promise resolving to the strategy result with execution info
   */
  async execute(context: SecurityStrategyContext): Promise<StrategyResult> {
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
