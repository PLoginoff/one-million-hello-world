/**
 * MlFeatureStoreStrategyFactory
 *
 * Factory for creating MlFeatureStore strategies by name.
 */

import { MlFeatureStoreDefaultStrategy } from '../strategies/DefaultStrategy';
import { MlFeatureStoreFastStrategy } from '../strategies/FastStrategy';
import { MlFeatureStoreReliableStrategy } from '../strategies/ReliableStrategy';
import { MlFeatureStoreCachedStrategy } from '../strategies/CachedStrategy';
import { MlFeatureStoreBatchStrategy } from '../strategies/BatchStrategy';

export interface IMlFeatureStoreStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class MlFeatureStoreStrategyFactory {
  private _strategies: Map<string, () => IMlFeatureStoreStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new MlFeatureStoreDefaultStrategy());
    this._strategies.set('fast', () => new MlFeatureStoreFastStrategy());
    this._strategies.set('reliable', () => new MlFeatureStoreReliableStrategy());
    this._strategies.set('cached', () => new MlFeatureStoreCachedStrategy());
    this._strategies.set('batch', () => new MlFeatureStoreBatchStrategy());
  }

  create(name: string): IMlFeatureStoreStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown ml-feature-store strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IMlFeatureStoreStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IMlFeatureStoreStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IMlFeatureStoreStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IMlFeatureStoreStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
