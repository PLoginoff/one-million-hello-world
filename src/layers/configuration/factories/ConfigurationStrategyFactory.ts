/**
 * ConfigurationStrategyFactory
 *
 * Factory for creating Configuration strategies by name.
 */

import { ConfigurationDefaultStrategy } from '../strategies/DefaultStrategy';
import { ConfigurationFastStrategy } from '../strategies/FastStrategy';
import { ConfigurationReliableStrategy } from '../strategies/ReliableStrategy';
import { ConfigurationCachedStrategy } from '../strategies/CachedStrategy';
import { ConfigurationBatchStrategy } from '../strategies/BatchStrategy';

export interface IConfigurationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ConfigurationStrategyFactory {
  private _strategies: Map<string, () => IConfigurationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ConfigurationDefaultStrategy());
    this._strategies.set('fast', () => new ConfigurationFastStrategy());
    this._strategies.set('reliable', () => new ConfigurationReliableStrategy());
    this._strategies.set('cached', () => new ConfigurationCachedStrategy());
    this._strategies.set('batch', () => new ConfigurationBatchStrategy());
  }

  create(name: string): IConfigurationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown configuration strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IConfigurationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IConfigurationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IConfigurationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IConfigurationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
