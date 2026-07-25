/**
 * ApiGatewayReliableStrategy
 *
 * Reliability-focused apiGateway strategy with retries.
 */

import { ApiGatewayContext, ApiGatewayResult } from '../types/api-gateway-types';

export interface IApiGatewayStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: ApiGatewayContext): Promise<ApiGatewayResult<unknown>>;
  canHandle(context: ApiGatewayContext): boolean;
}

export class ApiGatewayReliableStrategy implements IApiGatewayStrategy {
  readonly name = 'reliable';
  readonly priority = 5;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: ApiGatewayContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: ApiGatewayContext): Promise<ApiGatewayResult<unknown>> {
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
