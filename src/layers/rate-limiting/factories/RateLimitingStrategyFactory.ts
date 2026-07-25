/**
 * RateLimitingStrategyFactory
 *
 * Factory for creating RateLimiting strategies by name.
 */

import { RateLimitingDefaultStrategy } from '../strategies/DefaultStrategy';
import { RateLimitingFastStrategy } from '../strategies/FastStrategy';
import { RateLimitingReliableStrategy } from '../strategies/ReliableStrategy';
import { RateLimitingCachedStrategy } from '../strategies/CachedStrategy';
import { RateLimitingBatchStrategy } from '../strategies/BatchStrategy';

export interface IRateLimitingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class RateLimitingStrategyFactory {
  private _strategies: Map<string, () => IRateLimitingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new RateLimitingDefaultStrategy());
    this._strategies.set('fast', () => new RateLimitingFastStrategy());
    this._strategies.set('reliable', () => new RateLimitingReliableStrategy());
    this._strategies.set('cached', () => new RateLimitingCachedStrategy());
    this._strategies.set('batch', () => new RateLimitingBatchStrategy());
  }

  create(name: string): IRateLimitingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown rate-limiting strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IRateLimitingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IRateLimitingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IRateLimitingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IRateLimitingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
