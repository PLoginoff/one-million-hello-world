/**
 * PolicyEngineBatchStrategy
 *
 * Batch-oriented policyEngine strategy for bulk operations.
 */

import { PolicyEngineContext, PolicyEngineResult } from '../types/policy-engine-types';

export interface IPolicyEngineStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: PolicyEngineContext): Promise<PolicyEngineResult<unknown>>;
  canHandle(context: PolicyEngineContext): boolean;
}

export class PolicyEngineBatchStrategy implements IPolicyEngineStrategy {
  readonly name = 'batch';
  readonly priority = 3;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: PolicyEngineContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: PolicyEngineContext): Promise<PolicyEngineResult<unknown>> {
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
