/**
 * CostOptimizationStrategyFactory
 *
 * Factory for creating CostOptimization strategies by name.
 */

import { CostOptimizationDefaultStrategy } from '../strategies/DefaultStrategy';
import { CostOptimizationFastStrategy } from '../strategies/FastStrategy';
import { CostOptimizationReliableStrategy } from '../strategies/ReliableStrategy';
import { CostOptimizationCachedStrategy } from '../strategies/CachedStrategy';
import { CostOptimizationBatchStrategy } from '../strategies/BatchStrategy';

export interface ICostOptimizationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class CostOptimizationStrategyFactory {
  private _strategies: Map<string, () => ICostOptimizationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new CostOptimizationDefaultStrategy());
    this._strategies.set('fast', () => new CostOptimizationFastStrategy());
    this._strategies.set('reliable', () => new CostOptimizationReliableStrategy());
    this._strategies.set('cached', () => new CostOptimizationCachedStrategy());
    this._strategies.set('batch', () => new CostOptimizationBatchStrategy());
  }

  create(name: string): ICostOptimizationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown cost-optimization strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ICostOptimizationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ICostOptimizationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ICostOptimizationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ICostOptimizationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
