/**
 * Default Service Strategy
 *
 * Base implementation of the service strategy that provides
 * standard execution behavior.
 *
 * @module ServiceLayer/Strategies
 */

import { IServiceStrategy } from './IServiceStrategy';
import { ServiceContext } from '../types/service-types';
import { ServiceResult } from '../types/service-types';
import { ServiceError } from '../types/service-types';

/**
 * Default service strategy implementation.
 * Provides basic execution with validation and error handling.
 */
export class DefaultServiceStrategy<TInput = unknown, TOutput = unknown> implements IServiceStrategy<TInput, TOutput> {
  /** Unique name identifier for this strategy */
  readonly name = 'default';

  /** Priority level for strategy selection */
  readonly priority = 10;

  private _executionCount: number;

  /**
   * Creates a new DefaultServiceStrategy instance.
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
   * Executes the service operation with the given input and context.
   *
   * @param input - The input data for the service operation
   * @param context - The service execution context
   * @returns Promise resolving to the service result
   */
  async execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>> {
    this._executionCount++;

    // Validate context
    if (!context.requestId || !context.correlationId) {
      const error: ServiceError = {
        code: 'INVALID_CONTEXT',
        message: 'Invalid context: requestId and correlationId are required',
      };
      return { success: false, error };
    }

    // Simulate async operation
    await Promise.resolve();

    // Return success result with execution metadata
    return {
      success: true,
      data: {
        strategy: this.name,
        requestId: context.requestId,
        correlationId: context.correlationId,
        executionCount: this._executionCount,
        input,
      } as TOutput,
    };
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
