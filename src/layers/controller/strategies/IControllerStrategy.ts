/**
 * Controller Strategy Interface
 *
 * Defines the contract for controller execution strategies.
 * Each strategy implements the execute method with a specific behavior.
 *
 * @module ControllerLayer/Strategies
 */

import { ControllerContext } from '../types/controller-types';
import { ControllerResult } from '../types/controller-types';

/**
 * Interface for controller execution strategies.
 * Strategies encapsulate different execution behaviors for controller operations.
 */
export interface IControllerStrategy {
  /**
   * Executes the controller operation with the given context.
   *
   * @param context - The controller execution context containing request metadata
   * @returns Promise resolving to the controller result
   */
  execute(context: ControllerContext): Promise<ControllerResult>;

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
