/**
 * LocalizationStrategyFactory
 *
 * Factory for creating Localization strategies by name.
 */

import { LocalizationDefaultStrategy } from '../strategies/DefaultStrategy';
import { LocalizationFastStrategy } from '../strategies/FastStrategy';
import { LocalizationReliableStrategy } from '../strategies/ReliableStrategy';
import { LocalizationCachedStrategy } from '../strategies/CachedStrategy';
import { LocalizationBatchStrategy } from '../strategies/BatchStrategy';

export interface ILocalizationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class LocalizationStrategyFactory {
  private _strategies: Map<string, () => ILocalizationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new LocalizationDefaultStrategy());
    this._strategies.set('fast', () => new LocalizationFastStrategy());
    this._strategies.set('reliable', () => new LocalizationReliableStrategy());
    this._strategies.set('cached', () => new LocalizationCachedStrategy());
    this._strategies.set('batch', () => new LocalizationBatchStrategy());
  }

  create(name: string): ILocalizationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown localization strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ILocalizationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ILocalizationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ILocalizationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ILocalizationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
