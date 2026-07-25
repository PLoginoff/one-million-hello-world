/**
 * FeatureFlagsStrategyFactory
 *
 * Factory for creating FeatureFlags strategies by name.
 */

import { FeatureFlagsDefaultStrategy } from '../strategies/DefaultStrategy';
import { FeatureFlagsFastStrategy } from '../strategies/FastStrategy';
import { FeatureFlagsReliableStrategy } from '../strategies/ReliableStrategy';
import { FeatureFlagsCachedStrategy } from '../strategies/CachedStrategy';
import { FeatureFlagsBatchStrategy } from '../strategies/BatchStrategy';

export interface IFeatureFlagsStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class FeatureFlagsStrategyFactory {
  private _strategies: Map<string, () => IFeatureFlagsStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new FeatureFlagsDefaultStrategy());
    this._strategies.set('fast', () => new FeatureFlagsFastStrategy());
    this._strategies.set('reliable', () => new FeatureFlagsReliableStrategy());
    this._strategies.set('cached', () => new FeatureFlagsCachedStrategy());
    this._strategies.set('batch', () => new FeatureFlagsBatchStrategy());
  }

  create(name: string): IFeatureFlagsStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown feature-flags strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IFeatureFlagsStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IFeatureFlagsStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IFeatureFlagsStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IFeatureFlagsStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
