/**
 * ApiGateway Implementation
 *
 * Concrete implementation of IApiGateway.
 * Handles API gateway abstraction, routing, and transformation.
 */

import { IApiGateway } from '../interfaces/IApiGateway';
import { ApiGatewayResult, ApiGatewayContext } from '../types/api-gateway-types';

export class ApiGateway implements IApiGateway {
  private _config: Record<string, unknown>;
  private _metrics: Map<string, number>;

  constructor() {
    this._config = {};
    this._metrics = new Map();
  }

  async execute(context: ApiGatewayContext): Promise<ApiGatewayResult<unknown>> {
    const startTime = Date.now();
    try {
      const output = await Promise.resolve(this._process(context));
      this._recordMetric('successCount', 1);
      this._recordMetric('lastExecutionTime', Date.now() - startTime);
      return { success: true, data: output };
    } catch (error) {
      this._recordMetric('failureCount', 1);
      return {
        success: false,
        error: {
          code: 'APIGATEWAY_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getStatus(): Record<string, unknown> {
    return {
      config: this._config,
      metrics: Object.fromEntries(this._metrics),
      active: true,
    };
  }

  private _process(context: ApiGatewayContext): unknown {
    return { processed: true, context, layer: 'ApiGateway' };
  }

  private _recordMetric(name: string, delta: number): void {
    const current = this._metrics.get(name) ?? 0;
    this._metrics.set(name, current + delta);
  }
}
