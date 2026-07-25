/**
 * DistributedTracingStrategyFactory
 *
 * Factory for creating DistributedTracing strategies by name.
 */

import { DistributedTracingDefaultStrategy } from '../strategies/DefaultStrategy';
import { DistributedTracingFastStrategy } from '../strategies/FastStrategy';
import { DistributedTracingReliableStrategy } from '../strategies/ReliableStrategy';
import { DistributedTracingCachedStrategy } from '../strategies/CachedStrategy';
import { DistributedTracingBatchStrategy } from '../strategies/BatchStrategy';

export interface IDistributedTracingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DistributedTracingStrategyFactory {
  private _strategies: Map<string, () => IDistributedTracingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DistributedTracingDefaultStrategy());
    this._strategies.set('fast', () => new DistributedTracingFastStrategy());
    this._strategies.set('reliable', () => new DistributedTracingReliableStrategy());
    this._strategies.set('cached', () => new DistributedTracingCachedStrategy());
    this._strategies.set('batch', () => new DistributedTracingBatchStrategy());
  }

  create(name: string): IDistributedTracingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown distributed-tracing strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IDistributedTracingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDistributedTracingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDistributedTracingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDistributedTracingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
