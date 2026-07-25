/**
 * OutboxStrategyFactory
 *
 * Factory for creating Outbox strategies by name.
 */

import { OutboxDefaultStrategy } from '../strategies/DefaultStrategy';
import { OutboxFastStrategy } from '../strategies/FastStrategy';
import { OutboxReliableStrategy } from '../strategies/ReliableStrategy';
import { OutboxCachedStrategy } from '../strategies/CachedStrategy';
import { OutboxBatchStrategy } from '../strategies/BatchStrategy';

export interface IOutboxStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class OutboxStrategyFactory {
  private _strategies: Map<string, () => IOutboxStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new OutboxDefaultStrategy());
    this._strategies.set('fast', () => new OutboxFastStrategy());
    this._strategies.set('reliable', () => new OutboxReliableStrategy());
    this._strategies.set('cached', () => new OutboxCachedStrategy());
    this._strategies.set('batch', () => new OutboxBatchStrategy());
  }

  create(name: string): IOutboxStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown outbox strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IOutboxStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IOutboxStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IOutboxStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IOutboxStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
