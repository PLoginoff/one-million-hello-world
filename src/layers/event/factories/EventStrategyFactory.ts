/**
 * EventStrategyFactory
 *
 * Factory for creating Event strategies by name.
 */

import { EventDefaultStrategy } from '../strategies/DefaultStrategy';
import { EventFastStrategy } from '../strategies/FastStrategy';
import { EventReliableStrategy } from '../strategies/ReliableStrategy';
import { EventCachedStrategy } from '../strategies/CachedStrategy';
import { EventBatchStrategy } from '../strategies/BatchStrategy';

export interface IEventStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class EventStrategyFactory {
  private _strategies: Map<string, () => IEventStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new EventDefaultStrategy());
    this._strategies.set('fast', () => new EventFastStrategy());
    this._strategies.set('reliable', () => new EventReliableStrategy());
    this._strategies.set('cached', () => new EventCachedStrategy());
    this._strategies.set('batch', () => new EventBatchStrategy());
  }

  create(name: string): IEventStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown event strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IEventStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IEventStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IEventStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IEventStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
