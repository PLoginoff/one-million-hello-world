/**
 * CircuitBreakerStrategyFactory
 *
 * Factory for creating CircuitBreaker strategies by name.
 */

import { CircuitBreakerDefaultStrategy } from '../strategies/DefaultStrategy';
import { CircuitBreakerFastStrategy } from '../strategies/FastStrategy';
import { CircuitBreakerReliableStrategy } from '../strategies/ReliableStrategy';
import { CircuitBreakerCachedStrategy } from '../strategies/CachedStrategy';
import { CircuitBreakerBatchStrategy } from '../strategies/BatchStrategy';

export interface ICircuitBreakerStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class CircuitBreakerStrategyFactory {
  private _strategies: Map<string, () => ICircuitBreakerStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new CircuitBreakerDefaultStrategy());
    this._strategies.set('fast', () => new CircuitBreakerFastStrategy());
    this._strategies.set('reliable', () => new CircuitBreakerReliableStrategy());
    this._strategies.set('cached', () => new CircuitBreakerCachedStrategy());
    this._strategies.set('batch', () => new CircuitBreakerBatchStrategy());
  }

  create(name: string): ICircuitBreakerStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown circuit-breaker strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ICircuitBreakerStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ICircuitBreakerStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ICircuitBreakerStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ICircuitBreakerStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
