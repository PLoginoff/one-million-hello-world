/**
 * PerformanceTestingStrategyFactory
 *
 * Factory for creating PerformanceTesting strategies by name.
 */

import { PerformanceTestingDefaultStrategy } from '../strategies/DefaultStrategy';
import { PerformanceTestingFastStrategy } from '../strategies/FastStrategy';
import { PerformanceTestingReliableStrategy } from '../strategies/ReliableStrategy';
import { PerformanceTestingCachedStrategy } from '../strategies/CachedStrategy';
import { PerformanceTestingBatchStrategy } from '../strategies/BatchStrategy';

export interface IPerformanceTestingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class PerformanceTestingStrategyFactory {
  private _strategies: Map<string, () => IPerformanceTestingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new PerformanceTestingDefaultStrategy());
    this._strategies.set('fast', () => new PerformanceTestingFastStrategy());
    this._strategies.set('reliable', () => new PerformanceTestingReliableStrategy());
    this._strategies.set('cached', () => new PerformanceTestingCachedStrategy());
    this._strategies.set('batch', () => new PerformanceTestingBatchStrategy());
  }

  create(name: string): IPerformanceTestingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown performance-testing strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IPerformanceTestingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IPerformanceTestingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IPerformanceTestingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IPerformanceTestingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
