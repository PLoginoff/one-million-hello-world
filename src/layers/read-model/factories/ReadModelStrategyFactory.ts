/**
 * ReadModelStrategyFactory
 *
 * Factory for creating ReadModel strategies by name.
 */

import { ReadModelDefaultStrategy } from '../strategies/DefaultStrategy';
import { ReadModelFastStrategy } from '../strategies/FastStrategy';
import { ReadModelReliableStrategy } from '../strategies/ReliableStrategy';
import { ReadModelCachedStrategy } from '../strategies/CachedStrategy';
import { ReadModelBatchStrategy } from '../strategies/BatchStrategy';

export interface IReadModelStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ReadModelStrategyFactory {
  private _strategies: Map<string, () => IReadModelStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ReadModelDefaultStrategy());
    this._strategies.set('fast', () => new ReadModelFastStrategy());
    this._strategies.set('reliable', () => new ReadModelReliableStrategy());
    this._strategies.set('cached', () => new ReadModelCachedStrategy());
    this._strategies.set('batch', () => new ReadModelBatchStrategy());
  }

  create(name: string): IReadModelStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown read-model strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IReadModelStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IReadModelStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IReadModelStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IReadModelStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
