/**
 * DataQualityStrategyFactory
 *
 * Factory for creating DataQuality strategies by name.
 */

import { DataQualityDefaultStrategy } from '../strategies/DefaultStrategy';
import { DataQualityFastStrategy } from '../strategies/FastStrategy';
import { DataQualityReliableStrategy } from '../strategies/ReliableStrategy';
import { DataQualityCachedStrategy } from '../strategies/CachedStrategy';
import { DataQualityBatchStrategy } from '../strategies/BatchStrategy';

export interface IDataQualityStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DataQualityStrategyFactory {
  private _strategies: Map<string, () => IDataQualityStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DataQualityDefaultStrategy());
    this._strategies.set('fast', () => new DataQualityFastStrategy());
    this._strategies.set('reliable', () => new DataQualityReliableStrategy());
    this._strategies.set('cached', () => new DataQualityCachedStrategy());
    this._strategies.set('batch', () => new DataQualityBatchStrategy());
  }

  create(name: string): IDataQualityStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown data-quality strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IDataQualityStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDataQualityStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDataQualityStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDataQualityStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
