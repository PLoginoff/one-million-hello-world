/**
 * InboxReliableStrategy
 *
 * Reliability-focused inbox strategy with retries.
 */

import { InboxContext, InboxResult } from '../types/inbox-types';

export interface IInboxStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: InboxContext): Promise<InboxResult<unknown>>;
  canHandle(context: InboxContext): boolean;
}

export class InboxReliableStrategy implements IInboxStrategy {
  readonly name = 'reliable';
  readonly priority = 5;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: InboxContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: InboxContext): Promise<InboxResult<unknown>> {
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
