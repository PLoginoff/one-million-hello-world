/**
 * ThrottlingStrategyFactory
 *
 * Factory for creating Throttling strategies by name.
 */

import { ThrottlingDefaultStrategy } from '../strategies/DefaultStrategy';
import { ThrottlingFastStrategy } from '../strategies/FastStrategy';
import { ThrottlingReliableStrategy } from '../strategies/ReliableStrategy';
import { ThrottlingCachedStrategy } from '../strategies/CachedStrategy';
import { ThrottlingBatchStrategy } from '../strategies/BatchStrategy';

export interface IThrottlingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ThrottlingStrategyFactory {
  private _strategies: Map<string, () => IThrottlingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ThrottlingDefaultStrategy());
    this._strategies.set('fast', () => new ThrottlingFastStrategy());
    this._strategies.set('reliable', () => new ThrottlingReliableStrategy());
    this._strategies.set('cached', () => new ThrottlingCachedStrategy());
    this._strategies.set('batch', () => new ThrottlingBatchStrategy());
  }

  create(name: string): IThrottlingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown throttling strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IThrottlingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IThrottlingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IThrottlingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IThrottlingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
