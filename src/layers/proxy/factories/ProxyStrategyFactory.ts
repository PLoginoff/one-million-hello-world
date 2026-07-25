/**
 * ProxyStrategyFactory
 *
 * Factory for creating Proxy strategies by name.
 */

import { ProxyDefaultStrategy } from '../strategies/DefaultStrategy';
import { ProxyFastStrategy } from '../strategies/FastStrategy';
import { ProxyReliableStrategy } from '../strategies/ReliableStrategy';
import { ProxyCachedStrategy } from '../strategies/CachedStrategy';
import { ProxyBatchStrategy } from '../strategies/BatchStrategy';

export interface IProxyStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ProxyStrategyFactory {
  private _strategies: Map<string, () => IProxyStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ProxyDefaultStrategy());
    this._strategies.set('fast', () => new ProxyFastStrategy());
    this._strategies.set('reliable', () => new ProxyReliableStrategy());
    this._strategies.set('cached', () => new ProxyCachedStrategy());
    this._strategies.set('batch', () => new ProxyBatchStrategy());
  }

  create(name: string): IProxyStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown proxy strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IProxyStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IProxyStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IProxyStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IProxyStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
