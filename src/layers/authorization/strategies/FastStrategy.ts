/**
 * AuthorizationFastStrategy
 *
 * High-performance authorization strategy optimized for speed.
 */

import { AuthorizationContext, AuthorizationResult } from '../types/authorization-types';

export interface IAuthorizationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: AuthorizationContext): Promise<AuthorizationResult<unknown>>;
  canHandle(context: AuthorizationContext): boolean;
}

export class AuthorizationFastStrategy implements IAuthorizationStrategy {
  readonly name = 'fast';
  readonly priority = 10;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: AuthorizationContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: AuthorizationContext): Promise<AuthorizationResult<unknown>> {
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
