/**
 * Domain Strategy Interface
 *
 * Defines the contract for domain execution strategies.
 * Each strategy implements the execute method with a specific behavior.
 *
 * @module DomainLayer/Strategies
 */

import { DomainContext } from '../types/domain-types';
import { DomainResult } from '../types/domain-types';

/**
 * Interface for domain execution strategies.
 * Strategies encapsulate different execution behaviors for domain operations.
 */
export interface IDomainStrategy<TInput = unknown, TOutput = unknown> {
  /**
   * Executes the domain operation with the given input and context.
   *
   * @param input - The input data for the domain operation
   * @param context - The domain execution context containing correlation metadata
   * @returns Promise resolving to the domain result
   */
  execute(input: TInput, context: DomainContext): Promise<DomainResult<TOutput>>;

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
