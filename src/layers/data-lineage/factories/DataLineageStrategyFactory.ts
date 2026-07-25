/**
 * DataLineageStrategyFactory
 *
 * Factory for creating DataLineage strategies by name.
 */

import { DataLineageDefaultStrategy } from '../strategies/DefaultStrategy';
import { DataLineageFastStrategy } from '../strategies/FastStrategy';
import { DataLineageReliableStrategy } from '../strategies/ReliableStrategy';
import { DataLineageCachedStrategy } from '../strategies/CachedStrategy';
import { DataLineageBatchStrategy } from '../strategies/BatchStrategy';

export interface IDataLineageStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DataLineageStrategyFactory {
  private _strategies: Map<string, () => IDataLineageStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DataLineageDefaultStrategy());
    this._strategies.set('fast', () => new DataLineageFastStrategy());
    this._strategies.set('reliable', () => new DataLineageReliableStrategy());
    this._strategies.set('cached', () => new DataLineageCachedStrategy());
    this._strategies.set('batch', () => new DataLineageBatchStrategy());
  }

  create(name: string): IDataLineageStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown data-lineage strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IDataLineageStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDataLineageStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDataLineageStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDataLineageStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
