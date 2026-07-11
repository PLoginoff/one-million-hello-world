/**
 * ReadModel Interface
 *
 * Defines the contract for the Read model projections layer.
 */

import { ReadModelResult, ReadModelContext } from '../types/read-model-types';

export interface IReadModel {
  /**
   * Execute the readModel operation
   */
  execute(context: ReadModelContext): Promise<ReadModelResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
