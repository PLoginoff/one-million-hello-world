/**
 * StreamProcessing Interface
 *
 * Defines the contract for the Stream processing abstraction layer.
 */

import { StreamProcessingResult, StreamProcessingContext } from '../types/stream-processing-types';

export interface IStreamProcessing {
  /**
   * Execute the streamProcessing operation
   */
  execute(context: StreamProcessingContext): Promise<StreamProcessingResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
