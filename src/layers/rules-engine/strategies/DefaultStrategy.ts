/**
 * RulesEngineDefaultStrategy
 *
 * Standard rulesEngine strategy with balanced performance.
 */

import { RulesEngineContext, RulesEngineResult } from '../types/rules-engine-types';

export interface IRulesEngineStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: RulesEngineContext): Promise<RulesEngineResult<unknown>>;
  canHandle(context: RulesEngineContext): boolean;
}

export class RulesEngineDefaultStrategy implements IRulesEngineStrategy {
  readonly name = 'default';
  readonly priority = 0;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: RulesEngineContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: RulesEngineContext): Promise<RulesEngineResult<unknown>> {
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
