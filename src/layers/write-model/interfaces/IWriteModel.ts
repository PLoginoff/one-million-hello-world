/**
 * WriteModel Interface
 *
 * Defines the contract for the Write model and aggregate persistence layer.
 */

import { WriteModelResult, WriteModelContext } from '../types/write-model-types';

export interface IWriteModel {
  /**
   * Execute the writeModel operation
   */
  execute(context: WriteModelContext): Promise<WriteModelResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
