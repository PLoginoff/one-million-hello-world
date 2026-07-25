/**
 * MultiTenancyStrategyFactory
 *
 * Factory for creating MultiTenancy strategies by name.
 */

import { MultiTenancyDefaultStrategy } from '../strategies/DefaultStrategy';
import { MultiTenancyFastStrategy } from '../strategies/FastStrategy';
import { MultiTenancyReliableStrategy } from '../strategies/ReliableStrategy';
import { MultiTenancyCachedStrategy } from '../strategies/CachedStrategy';
import { MultiTenancyBatchStrategy } from '../strategies/BatchStrategy';

export interface IMultiTenancyStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class MultiTenancyStrategyFactory {
  private _strategies: Map<string, () => IMultiTenancyStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new MultiTenancyDefaultStrategy());
    this._strategies.set('fast', () => new MultiTenancyFastStrategy());
    this._strategies.set('reliable', () => new MultiTenancyReliableStrategy());
    this._strategies.set('cached', () => new MultiTenancyCachedStrategy());
    this._strategies.set('batch', () => new MultiTenancyBatchStrategy());
  }

  create(name: string): IMultiTenancyStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown multi-tenancy strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IMultiTenancyStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IMultiTenancyStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IMultiTenancyStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IMultiTenancyStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
