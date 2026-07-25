/**
 * SnapshotBatchStrategy
 *
 * Batch-oriented snapshot strategy for bulk operations.
 */

import { SnapshotContext, SnapshotResult } from '../types/snapshot-types';

export interface ISnapshotStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: SnapshotContext): Promise<SnapshotResult<unknown>>;
  canHandle(context: SnapshotContext): boolean;
}

export class SnapshotBatchStrategy implements ISnapshotStrategy {
  readonly name = 'batch';
  readonly priority = 3;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: SnapshotContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: SnapshotContext): Promise<SnapshotResult<unknown>> {
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
