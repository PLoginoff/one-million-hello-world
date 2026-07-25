/**
 * EdgeCacheStrategyFactory
 *
 * Factory for creating EdgeCache strategies by name.
 */

import { EdgeCacheDefaultStrategy } from '../strategies/DefaultStrategy';
import { EdgeCacheFastStrategy } from '../strategies/FastStrategy';
import { EdgeCacheReliableStrategy } from '../strategies/ReliableStrategy';
import { EdgeCacheCachedStrategy } from '../strategies/CachedStrategy';
import { EdgeCacheBatchStrategy } from '../strategies/BatchStrategy';

export interface IEdgeCacheStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class EdgeCacheStrategyFactory {
  private _strategies: Map<string, () => IEdgeCacheStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new EdgeCacheDefaultStrategy());
    this._strategies.set('fast', () => new EdgeCacheFastStrategy());
    this._strategies.set('reliable', () => new EdgeCacheReliableStrategy());
    this._strategies.set('cached', () => new EdgeCacheCachedStrategy());
    this._strategies.set('batch', () => new EdgeCacheBatchStrategy());
  }

  create(name: string): IEdgeCacheStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown edge-cache strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IEdgeCacheStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IEdgeCacheStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IEdgeCacheStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IEdgeCacheStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
