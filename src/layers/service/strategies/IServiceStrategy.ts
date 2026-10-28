/**
 * Service Strategy Interface
 *
 * Defines the contract for service execution strategies.
 * Each strategy implements the execute method with a specific behavior.
 *
 * @module ServiceLayer/Strategies
 */

import { ServiceContext } from '../types/service-types';
import { ServiceResult } from '../types/service-types';

/**
 * Interface for service execution strategies.
 * Strategies encapsulate different execution behaviors for service operations.
 */
export interface IServiceStrategy<TInput = unknown, TOutput = unknown> {
  /**
   * Executes the service operation with the given input and context.
   *
   * @param input - The input data for the service operation
   * @param context - The service execution context containing request metadata
   * @returns Promise resolving to the service result
   */
  execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>>;

  /**
   * Gets the unique name identifier for this strategy.
   *
   * @returns The strategy name
   */
  getName(): string;

  /**
   * Gets the priority of this strategy (higher values = higher priority).
   *
   * @returns The strategy priority
   */
  getPriority(): number;
}
