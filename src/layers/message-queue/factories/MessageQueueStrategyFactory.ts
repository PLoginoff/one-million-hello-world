/**
 * MessageQueueStrategyFactory
 *
 * Factory for creating MessageQueue strategies by name.
 */

import { MessageQueueDefaultStrategy } from '../strategies/DefaultStrategy';
import { MessageQueueFastStrategy } from '../strategies/FastStrategy';
import { MessageQueueReliableStrategy } from '../strategies/ReliableStrategy';
import { MessageQueueCachedStrategy } from '../strategies/CachedStrategy';
import { MessageQueueBatchStrategy } from '../strategies/BatchStrategy';

export interface IMessageQueueStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class MessageQueueStrategyFactory {
  private _strategies: Map<string, () => IMessageQueueStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new MessageQueueDefaultStrategy());
    this._strategies.set('fast', () => new MessageQueueFastStrategy());
    this._strategies.set('reliable', () => new MessageQueueReliableStrategy());
    this._strategies.set('cached', () => new MessageQueueCachedStrategy());
    this._strategies.set('batch', () => new MessageQueueBatchStrategy());
  }

  create(name: string): IMessageQueueStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown message-queue strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IMessageQueueStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IMessageQueueStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IMessageQueueStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IMessageQueueStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
