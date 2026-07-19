/**
 * BatchProcessing Interface
 *
 * Defines the contract for the Batch orchestration and chunk processing layer.
 */

import { BatchProcessingResult, BatchProcessingContext } from '../types/batch-processing-types';

export interface IBatchProcessing {
  execute(context: BatchProcessingContext): Promise<BatchProcessingResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
