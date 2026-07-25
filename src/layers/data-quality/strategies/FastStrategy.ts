/**
 * DataQualityFastStrategy
 *
 * High-performance dataQuality strategy optimized for speed.
 */

import { DataQualityContext, DataQualityResult } from '../types/data-quality-types';

export interface IDataQualityStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: DataQualityContext): Promise<DataQualityResult<unknown>>;
  canHandle(context: DataQualityContext): boolean;
}

export class DataQualityFastStrategy implements IDataQualityStrategy {
  readonly name = 'fast';
  readonly priority = 10;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: DataQualityContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: DataQualityContext): Promise<DataQualityResult<unknown>> {
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
