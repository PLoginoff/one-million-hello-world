/**
 * CacheStrategyFactory
 *
 * Factory for creating Cache strategies by name.
 */

import { CacheDefaultStrategy } from '../strategies/DefaultStrategy';
import { CacheFastStrategy } from '../strategies/FastStrategy';
import { CacheReliableStrategy } from '../strategies/ReliableStrategy';
import { CacheCachedStrategy } from '../strategies/CachedStrategy';
import { CacheBatchStrategy } from '../strategies/BatchStrategy';

export interface ICacheStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class CacheStrategyFactory {
  private _strategies: Map<string, () => ICacheStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new CacheDefaultStrategy());
    this._strategies.set('fast', () => new CacheFastStrategy());
    this._strategies.set('reliable', () => new CacheReliableStrategy());
    this._strategies.set('cached', () => new CacheCachedStrategy());
    this._strategies.set('batch', () => new CacheBatchStrategy());
  }

  create(name: string): ICacheStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown cache strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): ICacheStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ICacheStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ICacheStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ICacheStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
