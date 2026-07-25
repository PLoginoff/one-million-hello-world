/**
 * ApiVersioningFastStrategy
 *
 * High-performance apiVersioning strategy optimized for speed.
 */

import { ApiVersioningContext, ApiVersioningResult } from '../types/api-versioning-types';

export interface IApiVersioningStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: ApiVersioningContext): Promise<ApiVersioningResult<unknown>>;
  canHandle(context: ApiVersioningContext): boolean;
}

export class ApiVersioningFastStrategy implements IApiVersioningStrategy {
  readonly name = 'fast';
  readonly priority = 10;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: ApiVersioningContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: ApiVersioningContext): Promise<ApiVersioningResult<unknown>> {
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
