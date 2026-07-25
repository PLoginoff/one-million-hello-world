/**
 * MessageBusStrategyFactory
 *
 * Factory for creating MessageBus strategies by name.
 */

import { MessageBusDefaultStrategy } from '../strategies/DefaultStrategy';
import { MessageBusFastStrategy } from '../strategies/FastStrategy';
import { MessageBusReliableStrategy } from '../strategies/ReliableStrategy';
import { MessageBusCachedStrategy } from '../strategies/CachedStrategy';
import { MessageBusBatchStrategy } from '../strategies/BatchStrategy';

export interface IMessageBusStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class MessageBusStrategyFactory {
  private _strategies: Map<string, () => IMessageBusStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new MessageBusDefaultStrategy());
    this._strategies.set('fast', () => new MessageBusFastStrategy());
    this._strategies.set('reliable', () => new MessageBusReliableStrategy());
    this._strategies.set('cached', () => new MessageBusCachedStrategy());
    this._strategies.set('batch', () => new MessageBusBatchStrategy());
  }

  create(name: string): IMessageBusStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown message-bus strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IMessageBusStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IMessageBusStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IMessageBusStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IMessageBusStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
