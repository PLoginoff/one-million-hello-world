/**
 * Cqrs Interface
 *
 * Defines the contract for the Command Query Responsibility Segregation layer.
 */

import { CqrsResult, CqrsContext } from '../types/cqrs-types';

export interface ICqrs {
  /**
   * Execute the cqrs operation
   */
  execute(context: CqrsContext): Promise<CqrsResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
