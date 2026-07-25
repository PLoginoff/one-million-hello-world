/**
 * DataTransformationStrategyFactory
 *
 * Factory for creating DataTransformation strategies by name.
 */

import { DataTransformationDefaultStrategy } from '../strategies/DefaultStrategy';
import { DataTransformationFastStrategy } from '../strategies/FastStrategy';
import { DataTransformationReliableStrategy } from '../strategies/ReliableStrategy';
import { DataTransformationCachedStrategy } from '../strategies/CachedStrategy';
import { DataTransformationBatchStrategy } from '../strategies/BatchStrategy';

export interface IDataTransformationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DataTransformationStrategyFactory {
  private _strategies: Map<string, () => IDataTransformationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DataTransformationDefaultStrategy());
    this._strategies.set('fast', () => new DataTransformationFastStrategy());
    this._strategies.set('reliable', () => new DataTransformationReliableStrategy());
    this._strategies.set('cached', () => new DataTransformationCachedStrategy());
    this._strategies.set('batch', () => new DataTransformationBatchStrategy());
  }

  create(name: string): IDataTransformationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown data-transformation strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IDataTransformationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDataTransformationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDataTransformationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDataTransformationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
