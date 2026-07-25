/**
 * RetryStrategyFactory
 *
 * Factory for creating Retry strategies by name.
 */

import { RetryDefaultStrategy } from '../strategies/DefaultStrategy';
import { RetryFastStrategy } from '../strategies/FastStrategy';
import { RetryReliableStrategy } from '../strategies/ReliableStrategy';
import { RetryCachedStrategy } from '../strategies/CachedStrategy';
import { RetryBatchStrategy } from '../strategies/BatchStrategy';

export interface IRetryStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class RetryStrategyFactory {
  private _strategies: Map<string, () => IRetryStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new RetryDefaultStrategy());
    this._strategies.set('fast', () => new RetryFastStrategy());
    this._strategies.set('reliable', () => new RetryReliableStrategy());
    this._strategies.set('cached', () => new RetryCachedStrategy());
    this._strategies.set('batch', () => new RetryBatchStrategy());
  }

  create(name: string): IRetryStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown retry strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IRetryStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IRetryStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IRetryStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IRetryStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
