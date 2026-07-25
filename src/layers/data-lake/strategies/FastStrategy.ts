/**
 * DataLakeFastStrategy
 *
 * High-performance dataLake strategy optimized for speed.
 */

import { DataLakeContext, DataLakeResult } from '../types/data-lake-types';

export interface IDataLakeStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: DataLakeContext): Promise<DataLakeResult<unknown>>;
  canHandle(context: DataLakeContext): boolean;
}

export class DataLakeFastStrategy implements IDataLakeStrategy {
  readonly name = 'fast';
  readonly priority = 10;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: DataLakeContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: DataLakeContext): Promise<DataLakeResult<unknown>> {
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
