/**
 * SecretsRotationCachedStrategy
 *
 * Caching secretsRotation strategy with in-memory cache.
 */

import { SecretsRotationContext, SecretsRotationResult } from '../types/secrets-rotation-types';

export interface ISecretsRotationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: SecretsRotationContext): Promise<SecretsRotationResult<unknown>>;
  canHandle(context: SecretsRotationContext): boolean;
}

export class SecretsRotationCachedStrategy implements ISecretsRotationStrategy {
  readonly name = 'cached';
  readonly priority = 7;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: SecretsRotationContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: SecretsRotationContext): Promise<SecretsRotationResult<unknown>> {
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
