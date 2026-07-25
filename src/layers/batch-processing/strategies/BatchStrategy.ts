/**
 * BatchProcessingBatchStrategy
 *
 * Batch-oriented batchProcessing strategy for bulk operations.
 */

import { BatchProcessingContext, BatchProcessingResult } from '../types/batch-processing-types';

export interface IBatchProcessingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: BatchProcessingContext): Promise<BatchProcessingResult<unknown>>;
  canHandle(context: BatchProcessingContext): boolean;
}

export class BatchProcessingBatchStrategy implements IBatchProcessingStrategy {
  readonly name = 'batch';
  readonly priority = 3;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: BatchProcessingContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: BatchProcessingContext): Promise<BatchProcessingResult<unknown>> {
    this._executionCount++;
    await Promise.resolve();
    return {
      success: true,
      data: {
        strategy: this.name,
        input: context.input,
        metadata: context.metadata,
        executionCount: this._executionCount,
      },
    };
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): Record<string, unknown> {
    return { ...this._config };
  }

  getExecutionCount(): number {
    return this._executionCount;
  }
}
