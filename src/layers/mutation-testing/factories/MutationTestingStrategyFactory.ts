/**
 * MutationTestingStrategyFactory
 *
 * Factory for creating MutationTesting strategies by name.
 */

import { MutationTestingDefaultStrategy } from '../strategies/DefaultStrategy';
import { MutationTestingFastStrategy } from '../strategies/FastStrategy';
import { MutationTestingReliableStrategy } from '../strategies/ReliableStrategy';
import { MutationTestingCachedStrategy } from '../strategies/CachedStrategy';
import { MutationTestingBatchStrategy } from '../strategies/BatchStrategy';

export interface IMutationTestingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class MutationTestingStrategyFactory {
  private _strategies: Map<string, () => IMutationTestingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new MutationTestingDefaultStrategy());
    this._strategies.set('fast', () => new MutationTestingFastStrategy());
    this._strategies.set('reliable', () => new MutationTestingReliableStrategy());
    this._strategies.set('cached', () => new MutationTestingCachedStrategy());
    this._strategies.set('batch', () => new MutationTestingBatchStrategy());
  }

  create(name: string): IMutationTestingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown mutation-testing strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IMutationTestingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IMutationTestingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IMutationTestingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IMutationTestingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
