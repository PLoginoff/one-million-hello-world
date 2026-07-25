/**
 * MessageBusDefaultStrategy
 *
 * Standard messageBus strategy with balanced performance.
 */

import { MessageBusContext, MessageBusResult } from '../types/message-bus-types';

export interface IMessageBusStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: MessageBusContext): Promise<MessageBusResult<unknown>>;
  canHandle(context: MessageBusContext): boolean;
}

export class MessageBusDefaultStrategy implements IMessageBusStrategy {
  readonly name = 'default';
  readonly priority = 0;
  private _config: Record<string, unknown>;
  private _executionCount: number;

  constructor(config: Record<string, unknown> = {}) {
    this._config = config;
    this._executionCount = 0;
  }

  canHandle(context: MessageBusContext): boolean {
    return context.input !== null && context.input !== undefined;
  }

  async execute(context: MessageBusContext): Promise<MessageBusResult<unknown>> {
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
