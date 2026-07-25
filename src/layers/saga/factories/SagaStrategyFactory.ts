/**
 * SagaStrategyFactory
 *
 * Factory for creating Saga strategies by name.
 */

import { SagaDefaultStrategy } from '../strategies/DefaultStrategy';
import { SagaFastStrategy } from '../strategies/FastStrategy';
import { SagaReliableStrategy } from '../strategies/ReliableStrategy';
import { SagaCachedStrategy } from '../strategies/CachedStrategy';
import { SagaBatchStrategy } from '../strategies/BatchStrategy';

export interface ISagaStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SagaStrategyFactory {
  private _strategies: Map<string, () => ISagaStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SagaDefaultStrategy());
    this._strategies.set('fast', () => new SagaFastStrategy());
    this._strategies.set('reliable', () => new SagaReliableStrategy());
    this._strategies.set('cached', () => new SagaCachedStrategy());
    this._strategies.set('batch', () => new SagaBatchStrategy());
  }

  create(name: string): ISagaStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown saga strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): ISagaStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISagaStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISagaStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISagaStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
