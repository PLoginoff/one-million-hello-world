/**
 * ServiceDiscoveryStrategyFactory
 *
 * Factory for creating ServiceDiscovery strategies by name.
 */

import { ServiceDiscoveryDefaultStrategy } from '../strategies/DefaultStrategy';
import { ServiceDiscoveryFastStrategy } from '../strategies/FastStrategy';
import { ServiceDiscoveryReliableStrategy } from '../strategies/ReliableStrategy';
import { ServiceDiscoveryCachedStrategy } from '../strategies/CachedStrategy';
import { ServiceDiscoveryBatchStrategy } from '../strategies/BatchStrategy';

export interface IServiceDiscoveryStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ServiceDiscoveryStrategyFactory {
  private _strategies: Map<string, () => IServiceDiscoveryStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ServiceDiscoveryDefaultStrategy());
    this._strategies.set('fast', () => new ServiceDiscoveryFastStrategy());
    this._strategies.set('reliable', () => new ServiceDiscoveryReliableStrategy());
    this._strategies.set('cached', () => new ServiceDiscoveryCachedStrategy());
    this._strategies.set('batch', () => new ServiceDiscoveryBatchStrategy());
  }

  create(name: string): IServiceDiscoveryStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown service-discovery strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IServiceDiscoveryStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IServiceDiscoveryStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IServiceDiscoveryStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IServiceDiscoveryStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
