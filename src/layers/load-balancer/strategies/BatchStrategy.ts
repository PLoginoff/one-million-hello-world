/**
 * LoadBalancerBatchStrategy
 *
 * Batch-oriented loadBalancer strategy for bulk operations.
 */

import { LoadBalancerContext, LoadBalancerResult } from '../types/load-balancer-types';

export interface ILoadBalancerStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: LoadBalancerContext): Promise<LoadBalancerResult<unknown>>;
  canHandle(context: LoadBalancerContext): boolean;
}

export class LoadBalancerBatchStrategy implements ILoadBalancerStrategy {
  readonly name = 'batch';
  readonly priority = 3;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: LoadBalancerContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: LoadBalancerContext): Promise<LoadBalancerResult<unknown>> {
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
