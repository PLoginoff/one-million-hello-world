/**
 * OutboxCachedStrategy
 *
 * Caching outbox strategy with in-memory cache.
 */

import { OutboxContext, OutboxResult } from '../types/outbox-types';

export interface IOutboxStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: OutboxContext): Promise<OutboxResult<unknown>>;
  canHandle(context: OutboxContext): boolean;
}

export class OutboxCachedStrategy implements IOutboxStrategy {
  readonly name = 'cached';
  readonly priority = 7;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: OutboxContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: OutboxContext): Promise<OutboxResult<unknown>> {
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
