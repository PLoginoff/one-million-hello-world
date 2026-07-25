/**
 * SearchStrategyFactory
 *
 * Factory for creating Search strategies by name.
 */

import { SearchDefaultStrategy } from '../strategies/DefaultStrategy';
import { SearchFastStrategy } from '../strategies/FastStrategy';
import { SearchReliableStrategy } from '../strategies/ReliableStrategy';
import { SearchCachedStrategy } from '../strategies/CachedStrategy';
import { SearchBatchStrategy } from '../strategies/BatchStrategy';

export interface ISearchStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SearchStrategyFactory {
  private _strategies: Map<string, () => ISearchStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SearchDefaultStrategy());
    this._strategies.set('fast', () => new SearchFastStrategy());
    this._strategies.set('reliable', () => new SearchReliableStrategy());
    this._strategies.set('cached', () => new SearchCachedStrategy());
    this._strategies.set('batch', () => new SearchBatchStrategy());
  }

  create(name: string): ISearchStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown search strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): ISearchStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISearchStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISearchStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISearchStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
