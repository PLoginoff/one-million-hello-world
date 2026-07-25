/**
 * Oauth2FastStrategy
 *
 * High-performance oauth2 strategy optimized for speed.
 */

import { Oauth2Context, Oauth2Result } from '../types/oauth2-types';

export interface IOauth2Strategy {
  readonly name: string;
  readonly priority: number;
  execute(context: Oauth2Context): Promise<Oauth2Result<unknown>>;
  canHandle(context: Oauth2Context): boolean;
}

export class Oauth2FastStrategy implements IOauth2Strategy {
  readonly name = 'fast';
  readonly priority = 10;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: Oauth2Context): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: Oauth2Context): Promise<Oauth2Result<unknown>> {
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
