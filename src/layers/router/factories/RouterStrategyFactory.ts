/**
 * RouterStrategyFactory
 *
 * Factory for creating Router strategies by name.
 */

import { RouterDefaultStrategy } from '../strategies/DefaultStrategy';
import { RouterFastStrategy } from '../strategies/FastStrategy';
import { RouterReliableStrategy } from '../strategies/ReliableStrategy';
import { RouterCachedStrategy } from '../strategies/CachedStrategy';
import { RouterBatchStrategy } from '../strategies/BatchStrategy';

export interface IRouterLegacyStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class RouterStrategyFactory {
  private _strategies: Map<string, () => IRouterLegacyStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new RouterDefaultStrategy());
    this._strategies.set('fast', () => new RouterFastStrategy());
    this._strategies.set('reliable', () => new RouterReliableStrategy());
    this._strategies.set('cached', () => new RouterCachedStrategy());
    this._strategies.set('batch', () => new RouterBatchStrategy());
  }

  create(name: string): IRouterLegacyStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown router strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IRouterLegacyStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IRouterLegacyStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IRouterLegacyStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IRouterLegacyStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
