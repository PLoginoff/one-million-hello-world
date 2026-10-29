/**
 * Default Domain Strategy
 *
 * Base implementation of the domain strategy that provides
 * standard execution behavior.
 *
 * @module DomainLayer/Strategies
 */

import { IDomainStrategy } from './IDomainStrategy';
import { DomainContext } from '../types/domain-types';
import { DomainResult } from '../types/domain-types';
import { DomainError } from '../types/domain-types';

/**
 * Default domain strategy implementation.
 * Provides basic execution with validation and error handling.
 */
export class DefaultDomainStrategy<TInput = unknown, TOutput = unknown> implements IDomainStrategy<TInput, TOutput> {
  /** Unique name identifier for this strategy */
  readonly name = 'default';

  /** Priority level for strategy selection */
  readonly priority = 10;

  private _executionCount: number;

  /**
   * Creates a new DefaultDomainStrategy instance.
   */
  constructor() {
    this._executionCount = 0;
  }

  /**
   * Gets the strategy name.
   *
   * @returns The strategy name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Gets the strategy priority.
   *
   * @returns The strategy priority
   */
  getPriority(): number {
    return this.priority;
  }

  /**
   * Executes the domain operation with the given input and context.
   *
   * @param input - The input data for the domain operation
   * @param context - The domain execution context
   * @returns Promise resolving to the domain result
   */
  async execute(input: TInput, context: DomainContext): Promise<DomainResult<TOutput>> {
    this._executionCount++;

    // Validate context
    if (!context.correlationId) {
      const error: DomainError = {
        code: 'INVALID_CONTEXT',
        message: 'Invalid context: correlationId is required',
      };
      return { success: false, error };
    }

    // Simulate async operation
    await Promise.resolve();

    // Return success result with execution metadata
    return {
      success: true,
      value: {
        strategy: this.name,
        correlationId: context.correlationId,
        causationId: context.causationId,
        executionCount: this._executionCount,
        input,
      } as TOutput,
    };
  }

  /**
   * Alias for execute (backward compatibility).
   */
  async process(input: TInput, context?: DomainContext): Promise<DomainResult<TOutput>> {
    const ctx = context ?? { correlationId: 'default', timestamp: new Date() };
    return this.execute(input, ctx);
  }

  /**
   * Gets the total execution count for this strategy instance.
   *
   * @returns The number of times execute has been called
   */
  getExecutionCount(): number {
    return this._executionCount;
  }
}
