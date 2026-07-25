/**
 * MutationTestingFastStrategy
 *
 * High-performance mutationTesting strategy optimized for speed.
 */

import { MutationTestingContext, MutationTestingResult } from '../types/mutation-testing-types';

export interface IMutationTestingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: MutationTestingContext): Promise<MutationTestingResult<unknown>>;
  canHandle(context: MutationTestingContext): boolean;
}

export class MutationTestingFastStrategy implements IMutationTestingStrategy {
  readonly name = 'fast';
  readonly priority = 10;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: MutationTestingContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: MutationTestingContext): Promise<MutationTestingResult<unknown>> {
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
