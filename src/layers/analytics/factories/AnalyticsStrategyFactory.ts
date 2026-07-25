/**
 * AnalyticsStrategyFactory
 *
 * Factory for creating Analytics strategies by name.
 */

import { AnalyticsDefaultStrategy } from '../strategies/DefaultStrategy';
import { AnalyticsFastStrategy } from '../strategies/FastStrategy';
import { AnalyticsReliableStrategy } from '../strategies/ReliableStrategy';
import { AnalyticsCachedStrategy } from '../strategies/CachedStrategy';
import { AnalyticsBatchStrategy } from '../strategies/BatchStrategy';

export interface IAnalyticsStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class AnalyticsStrategyFactory {
  private _strategies: Map<string, () => IAnalyticsStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new AnalyticsDefaultStrategy());
    this._strategies.set('fast', () => new AnalyticsFastStrategy());
    this._strategies.set('reliable', () => new AnalyticsReliableStrategy());
    this._strategies.set('cached', () => new AnalyticsCachedStrategy());
    this._strategies.set('batch', () => new AnalyticsBatchStrategy());
  }

  create(name: string): IAnalyticsStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown analytics strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IAnalyticsStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IAnalyticsStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IAnalyticsStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IAnalyticsStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
