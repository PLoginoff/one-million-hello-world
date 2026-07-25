/**
 * UnitOfWorkBatchStrategy
 *
 * Batch-oriented unitOfWork strategy for bulk operations.
 */

import { UnitOfWorkContext, UnitOfWorkResult } from '../types/unit-of-work-types';

export interface IUnitOfWorkStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: UnitOfWorkContext): Promise<UnitOfWorkResult<unknown>>;
  canHandle(context: UnitOfWorkContext): boolean;
}

export class UnitOfWorkBatchStrategy implements IUnitOfWorkStrategy {
  readonly name = 'batch';
  readonly priority = 3;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: UnitOfWorkContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: UnitOfWorkContext): Promise<UnitOfWorkResult<unknown>> {
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
