/**
 * DomainStrategyFactory
 *
 * Factory for creating Domain strategies by name.
 */

import { DomainDefaultStrategy } from '../strategies/DefaultStrategy';
import { DomainFastStrategy } from '../strategies/FastStrategy';
import { DomainReliableStrategy } from '../strategies/ReliableStrategy';
import { DomainCachedStrategy } from '../strategies/CachedStrategy';
import { DomainBatchStrategy } from '../strategies/BatchStrategy';

export interface IDomainStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DomainStrategyFactory {
  private _strategies: Map<string, () => IDomainStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DomainDefaultStrategy());
    this._strategies.set('fast', () => new DomainFastStrategy());
    this._strategies.set('reliable', () => new DomainReliableStrategy());
    this._strategies.set('cached', () => new DomainCachedStrategy());
    this._strategies.set('batch', () => new DomainBatchStrategy());
  }

  create(name: string): IDomainStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown domain strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IDomainStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDomainStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDomainStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDomainStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
