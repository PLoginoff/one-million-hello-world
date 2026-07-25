/**
 * JwtValidationFastStrategy
 *
 * High-performance jwtValidation strategy optimized for speed.
 */

import { JwtValidationContext, JwtValidationResult } from '../types/jwt-validation-types';

export interface IJwtValidationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: JwtValidationContext): Promise<JwtValidationResult<unknown>>;
  canHandle(context: JwtValidationContext): boolean;
}

export class JwtValidationFastStrategy implements IJwtValidationStrategy {
  readonly name = 'fast';
  readonly priority = 10;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: JwtValidationContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: JwtValidationContext): Promise<JwtValidationResult<unknown>> {
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
