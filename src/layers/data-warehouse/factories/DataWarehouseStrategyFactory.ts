/**
 * DataWarehouseStrategyFactory
 *
 * Factory for creating DataWarehouse strategies by name.
 */

import { DataWarehouseDefaultStrategy } from '../strategies/DefaultStrategy';
import { DataWarehouseFastStrategy } from '../strategies/FastStrategy';
import { DataWarehouseReliableStrategy } from '../strategies/ReliableStrategy';
import { DataWarehouseCachedStrategy } from '../strategies/CachedStrategy';
import { DataWarehouseBatchStrategy } from '../strategies/BatchStrategy';

export interface IDataWarehouseStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DataWarehouseStrategyFactory {
  private _strategies: Map<string, () => IDataWarehouseStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DataWarehouseDefaultStrategy());
    this._strategies.set('fast', () => new DataWarehouseFastStrategy());
    this._strategies.set('reliable', () => new DataWarehouseReliableStrategy());
    this._strategies.set('cached', () => new DataWarehouseCachedStrategy());
    this._strategies.set('batch', () => new DataWarehouseBatchStrategy());
  }

  create(name: string): IDataWarehouseStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown data-warehouse strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IDataWarehouseStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDataWarehouseStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDataWarehouseStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDataWarehouseStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
