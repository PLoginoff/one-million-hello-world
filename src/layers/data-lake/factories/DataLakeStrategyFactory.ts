/**
 * DataLakeStrategyFactory
 *
 * Factory for creating DataLake strategies by name.
 */

import { DataLakeDefaultStrategy } from '../strategies/DefaultStrategy';
import { DataLakeFastStrategy } from '../strategies/FastStrategy';
import { DataLakeReliableStrategy } from '../strategies/ReliableStrategy';
import { DataLakeCachedStrategy } from '../strategies/CachedStrategy';
import { DataLakeBatchStrategy } from '../strategies/BatchStrategy';

export interface IDataLakeStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DataLakeStrategyFactory {
  private _strategies: Map<string, () => IDataLakeStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DataLakeDefaultStrategy());
    this._strategies.set('fast', () => new DataLakeFastStrategy());
    this._strategies.set('reliable', () => new DataLakeReliableStrategy());
    this._strategies.set('cached', () => new DataLakeCachedStrategy());
    this._strategies.set('batch', () => new DataLakeBatchStrategy());
  }

  create(name: string): IDataLakeStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown data-lake strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IDataLakeStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDataLakeStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDataLakeStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDataLakeStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
