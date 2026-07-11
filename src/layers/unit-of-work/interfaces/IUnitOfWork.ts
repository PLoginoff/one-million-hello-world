/**
 * UnitOfWork Interface
 *
 * Defines the contract for the Unit of work pattern layer.
 */

import { UnitOfWorkResult, UnitOfWorkContext } from '../types/unit-of-work-types';

export interface IUnitOfWork {
  /**
   * Execute the unitOfWork operation
   */
  execute(context: UnitOfWorkContext): Promise<UnitOfWorkResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
