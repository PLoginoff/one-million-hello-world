/**
 * DecoratorStrategyFactory
 *
 * Factory for creating Decorator strategies by name.
 */

import { DecoratorDefaultStrategy } from '../strategies/DefaultStrategy';
import { DecoratorFastStrategy } from '../strategies/FastStrategy';
import { DecoratorReliableStrategy } from '../strategies/ReliableStrategy';
import { DecoratorCachedStrategy } from '../strategies/CachedStrategy';
import { DecoratorBatchStrategy } from '../strategies/BatchStrategy';

export interface IDecoratorStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DecoratorStrategyFactory {
  private _strategies: Map<string, () => IDecoratorStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DecoratorDefaultStrategy());
    this._strategies.set('fast', () => new DecoratorFastStrategy());
    this._strategies.set('reliable', () => new DecoratorReliableStrategy());
    this._strategies.set('cached', () => new DecoratorCachedStrategy());
    this._strategies.set('batch', () => new DecoratorBatchStrategy());
  }

  create(name: string): IDecoratorStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown decorator strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IDecoratorStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDecoratorStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDecoratorStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDecoratorStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
