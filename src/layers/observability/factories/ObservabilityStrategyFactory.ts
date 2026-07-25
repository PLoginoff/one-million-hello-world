/**
 * ObservabilityStrategyFactory
 *
 * Factory for creating Observability strategies by name.
 */

import { ObservabilityDefaultStrategy } from '../strategies/DefaultStrategy';
import { ObservabilityFastStrategy } from '../strategies/FastStrategy';
import { ObservabilityReliableStrategy } from '../strategies/ReliableStrategy';
import { ObservabilityCachedStrategy } from '../strategies/CachedStrategy';
import { ObservabilityBatchStrategy } from '../strategies/BatchStrategy';

export interface IObservabilityStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ObservabilityStrategyFactory {
  private _strategies: Map<string, () => IObservabilityStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ObservabilityDefaultStrategy());
    this._strategies.set('fast', () => new ObservabilityFastStrategy());
    this._strategies.set('reliable', () => new ObservabilityReliableStrategy());
    this._strategies.set('cached', () => new ObservabilityCachedStrategy());
    this._strategies.set('batch', () => new ObservabilityBatchStrategy());
  }

  create(name: string): IObservabilityStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown observability strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IObservabilityStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IObservabilityStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IObservabilityStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IObservabilityStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
