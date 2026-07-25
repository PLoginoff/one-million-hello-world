/**
 * ThrottlingReliableStrategy
 *
 * Reliability-focused throttling strategy with retries.
 */

import { ThrottlingContext, ThrottlingResult } from '../types/throttling-types';

export interface IThrottlingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: ThrottlingContext): Promise<ThrottlingResult<unknown>>;
  canHandle(context: ThrottlingContext): boolean;
}

export class ThrottlingReliableStrategy implements IThrottlingStrategy {
  readonly name = 'reliable';
  readonly priority = 5;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: ThrottlingContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: ThrottlingContext): Promise<ThrottlingResult<unknown>> {
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
