/**
 * MiddlewareStrategyFactory
 *
 * Factory for creating Middleware strategies by name.
 */

import { MiddlewareDefaultStrategy } from '../strategies/DefaultStrategy';
import { MiddlewareFastStrategy } from '../strategies/FastStrategy';
import { MiddlewareReliableStrategy } from '../strategies/ReliableStrategy';
import { MiddlewareCachedStrategy } from '../strategies/CachedStrategy';
import { MiddlewareBatchStrategy } from '../strategies/BatchStrategy';

export interface IMiddlewareLegacyStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class MiddlewareStrategyFactory {
  private _strategies: Map<string, () => IMiddlewareLegacyStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new MiddlewareDefaultStrategy());
    this._strategies.set('fast', () => new MiddlewareFastStrategy());
    this._strategies.set('reliable', () => new MiddlewareReliableStrategy());
    this._strategies.set('cached', () => new MiddlewareCachedStrategy());
    this._strategies.set('batch', () => new MiddlewareBatchStrategy());
  }

  create(name: string): IMiddlewareLegacyStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown middleware strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IMiddlewareLegacyStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IMiddlewareLegacyStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IMiddlewareLegacyStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IMiddlewareLegacyStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
