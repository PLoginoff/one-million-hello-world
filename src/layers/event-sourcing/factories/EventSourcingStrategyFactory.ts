/**
 * EventSourcingStrategyFactory
 *
 * Factory for creating EventSourcing strategies by name.
 */

import { EventSourcingDefaultStrategy } from '../strategies/DefaultStrategy';
import { EventSourcingFastStrategy } from '../strategies/FastStrategy';
import { EventSourcingReliableStrategy } from '../strategies/ReliableStrategy';
import { EventSourcingCachedStrategy } from '../strategies/CachedStrategy';
import { EventSourcingBatchStrategy } from '../strategies/BatchStrategy';

export interface IEventSourcingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class EventSourcingStrategyFactory {
  private _strategies: Map<string, () => IEventSourcingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new EventSourcingDefaultStrategy());
    this._strategies.set('fast', () => new EventSourcingFastStrategy());
    this._strategies.set('reliable', () => new EventSourcingReliableStrategy());
    this._strategies.set('cached', () => new EventSourcingCachedStrategy());
    this._strategies.set('batch', () => new EventSourcingBatchStrategy());
  }

  create(name: string): IEventSourcingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown event-sourcing strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IEventSourcingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IEventSourcingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IEventSourcingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IEventSourcingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
