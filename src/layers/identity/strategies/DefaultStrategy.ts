/**
 * IdentityDefaultStrategy
 *
 * Standard identity strategy with balanced performance.
 */

import { IdentityContext, IdentityResult } from '../types/identity-types';

export interface IIdentityStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: IdentityContext): Promise<IdentityResult<unknown>>;
  canHandle(context: IdentityContext): boolean;
}

export class IdentityDefaultStrategy implements IIdentityStrategy {
  readonly name = 'default';
  readonly priority = 0;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: IdentityContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: IdentityContext): Promise<IdentityResult<unknown>> {
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
