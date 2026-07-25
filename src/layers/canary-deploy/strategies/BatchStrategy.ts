/**
 * CanaryDeployBatchStrategy
 *
 * Batch-oriented canaryDeploy strategy for bulk operations.
 */

import { CanaryDeployContext, CanaryDeployResult } from '../types/canary-deploy-types';

export interface ICanaryDeployStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: CanaryDeployContext): Promise<CanaryDeployResult<unknown>>;
  canHandle(context: CanaryDeployContext): boolean;
}

export class CanaryDeployBatchStrategy implements ICanaryDeployStrategy {
  readonly name = 'batch';
  readonly priority = 3;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: CanaryDeployContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: CanaryDeployContext): Promise<CanaryDeployResult<unknown>> {
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
