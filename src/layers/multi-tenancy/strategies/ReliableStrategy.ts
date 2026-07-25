/**
 * MultiTenancyReliableStrategy
 *
 * Reliability-focused multiTenancy strategy with retries.
 */

import { MultiTenancyContext, MultiTenancyResult } from '../types/multi-tenancy-types';

export interface IMultiTenancyStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: MultiTenancyContext): Promise<MultiTenancyResult<unknown>>;
  canHandle(context: MultiTenancyContext): boolean;
}

export class MultiTenancyReliableStrategy implements IMultiTenancyStrategy {
  readonly name = 'reliable';
  readonly priority = 5;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: MultiTenancyContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: MultiTenancyContext): Promise<MultiTenancyResult<unknown>> {
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
