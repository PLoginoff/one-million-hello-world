/**
 * Default Controller Strategy
 *
 * Base implementation of the controller strategy that provides
 * standard execution behavior.
 *
 * @module ControllerLayer/Strategies
 */

import { IControllerStrategy } from './IControllerStrategy';
import { ControllerContext } from '../types/controller-types';
import { ControllerResult } from '../types/controller-types';
import { ControllerError } from '../types/controller-types';
import { HttpStatusCode } from '../types/controller-types';

/**
 * Default controller strategy implementation.
 * Provides basic execution with validation and error handling.
 */
export class DefaultControllerStrategy implements IControllerStrategy {
  /** Unique name identifier for this strategy */
  readonly name = 'default';

  /** Priority level for strategy selection */
  readonly priority = 10;

  private _executionCount: number;

  /**
   * Creates a new DefaultControllerStrategy instance.
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
   * Executes the controller operation with the given context.
   *
   * @param context - The controller execution context
   * @returns Promise resolving to the controller result
   */
  async execute(context: ControllerContext): Promise<ControllerResult> {
    this._executionCount++;

    // Validate context
    if (!context.requestId || !context.correlationId) {
      const error: ControllerError = {
        code: HttpStatusCode.BAD_REQUEST,
        message: 'Invalid context: requestId and correlationId are required',
      };
      return { success: false, error };
    }

    // Simulate async operation
    await Promise.resolve();

    // Return success result with execution metadata
    return {
      success: true,
      response: {
        statusCode: HttpStatusCode.OK,
        headers: new Map([['X-Execution-Count', String(this._executionCount)]]),
        body: Buffer.from(
          JSON.stringify({
            strategy: this.name,
            requestId: context.requestId,
            correlationId: context.correlationId,
            executionCount: this._executionCount,
          })
        ),
      },
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
