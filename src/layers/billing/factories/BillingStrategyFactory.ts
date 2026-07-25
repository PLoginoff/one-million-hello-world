/**
 * BillingStrategyFactory
 *
 * Factory for creating Billing strategies by name.
 */

import { BillingDefaultStrategy } from '../strategies/DefaultStrategy';
import { BillingFastStrategy } from '../strategies/FastStrategy';
import { BillingReliableStrategy } from '../strategies/ReliableStrategy';
import { BillingCachedStrategy } from '../strategies/CachedStrategy';
import { BillingBatchStrategy } from '../strategies/BatchStrategy';

export interface IBillingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class BillingStrategyFactory {
  private _strategies: Map<string, () => IBillingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new BillingDefaultStrategy());
    this._strategies.set('fast', () => new BillingFastStrategy());
    this._strategies.set('reliable', () => new BillingReliableStrategy());
    this._strategies.set('cached', () => new BillingCachedStrategy());
    this._strategies.set('batch', () => new BillingBatchStrategy());
  }

  create(name: string): IBillingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown billing strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IBillingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IBillingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IBillingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IBillingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
