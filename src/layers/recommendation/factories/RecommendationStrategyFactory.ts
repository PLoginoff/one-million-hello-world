/**
 * RecommendationStrategyFactory
 *
 * Factory for creating Recommendation strategies by name.
 */

import { RecommendationDefaultStrategy } from '../strategies/DefaultStrategy';
import { RecommendationFastStrategy } from '../strategies/FastStrategy';
import { RecommendationReliableStrategy } from '../strategies/ReliableStrategy';
import { RecommendationCachedStrategy } from '../strategies/CachedStrategy';
import { RecommendationBatchStrategy } from '../strategies/BatchStrategy';

export interface IRecommendationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class RecommendationStrategyFactory {
  private _strategies: Map<string, () => IRecommendationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new RecommendationDefaultStrategy());
    this._strategies.set('fast', () => new RecommendationFastStrategy());
    this._strategies.set('reliable', () => new RecommendationReliableStrategy());
    this._strategies.set('cached', () => new RecommendationCachedStrategy());
    this._strategies.set('batch', () => new RecommendationBatchStrategy());
  }

  create(name: string): IRecommendationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown recommendation strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IRecommendationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IRecommendationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IRecommendationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IRecommendationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
