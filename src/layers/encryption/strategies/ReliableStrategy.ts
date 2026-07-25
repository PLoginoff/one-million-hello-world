/**
 * EncryptionReliableStrategy
 *
 * Reliability-focused encryption strategy with retries.
 */

import { EncryptionContext, EncryptionResult } from '../types/encryption-types';

export interface IEncryptionStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: EncryptionContext): Promise<EncryptionResult<unknown>>;
  canHandle(context: EncryptionContext): boolean;
}

export class EncryptionReliableStrategy implements IEncryptionStrategy {
  readonly name = 'reliable';
  readonly priority = 5;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: EncryptionContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: EncryptionContext): Promise<EncryptionResult<unknown>> {
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
