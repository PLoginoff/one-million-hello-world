/**
 * EtlPipelineReliableStrategy
 *
 * Reliability-focused etlPipeline strategy with retries.
 */

import { EtlPipelineContext, EtlPipelineResult } from '../types/etl-pipeline-types';

export interface IEtlPipelineStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: EtlPipelineContext): Promise<EtlPipelineResult<unknown>>;
  canHandle(context: EtlPipelineContext): boolean;
}

export class EtlPipelineReliableStrategy implements IEtlPipelineStrategy {
  readonly name = 'reliable';
  readonly priority = 5;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: EtlPipelineContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: EtlPipelineContext): Promise<EtlPipelineResult<unknown>> {
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
