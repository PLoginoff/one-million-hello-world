/**
 * ServiceStrategyFactory
 *
 * Factory for creating Service strategies by name.
 */

import { ServiceDefaultStrategy } from '../strategies/DefaultStrategy';
import { ServiceFastStrategy } from '../strategies/FastStrategy';
import { ServiceReliableStrategy } from '../strategies/ReliableStrategy';
import { ServiceCachedStrategy } from '../strategies/CachedStrategy';
import { ServiceBatchStrategy } from '../strategies/BatchStrategy';

export interface IServiceStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ServiceStrategyFactory {
  private _strategies: Map<string, () => IServiceStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ServiceDefaultStrategy());
    this._strategies.set('fast', () => new ServiceFastStrategy());
    this._strategies.set('reliable', () => new ServiceReliableStrategy());
    this._strategies.set('cached', () => new ServiceCachedStrategy());
    this._strategies.set('batch', () => new ServiceBatchStrategy());
  }

  create(name: string): IServiceStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown service strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IServiceStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IServiceStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IServiceStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IServiceStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
