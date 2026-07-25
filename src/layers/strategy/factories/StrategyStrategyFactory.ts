/**
 * StrategyStrategyFactory
 *
 * Factory for creating Strategy strategies by name.
 */

import { StrategyDefaultStrategy } from '../strategies/DefaultStrategy';
import { StrategyFastStrategy } from '../strategies/FastStrategy';
import { StrategyReliableStrategy } from '../strategies/ReliableStrategy';
import { StrategyCachedStrategy } from '../strategies/CachedStrategy';
import { StrategyBatchStrategy } from '../strategies/BatchStrategy';

export interface IStrategyStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class StrategyStrategyFactory {
  private _strategies: Map<string, () => IStrategyStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new StrategyDefaultStrategy());
    this._strategies.set('fast', () => new StrategyFastStrategy());
    this._strategies.set('reliable', () => new StrategyReliableStrategy());
    this._strategies.set('cached', () => new StrategyCachedStrategy());
    this._strategies.set('batch', () => new StrategyBatchStrategy());
  }

  create(name: string): IStrategyStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown strategy strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IStrategyStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IStrategyStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IStrategyStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IStrategyStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
