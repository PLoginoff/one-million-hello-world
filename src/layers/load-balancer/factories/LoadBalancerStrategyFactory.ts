/**
 * LoadBalancerStrategyFactory
 *
 * Factory for creating LoadBalancer strategies by name.
 */

import { LoadBalancerDefaultStrategy } from '../strategies/DefaultStrategy';
import { LoadBalancerFastStrategy } from '../strategies/FastStrategy';
import { LoadBalancerReliableStrategy } from '../strategies/ReliableStrategy';
import { LoadBalancerCachedStrategy } from '../strategies/CachedStrategy';
import { LoadBalancerBatchStrategy } from '../strategies/BatchStrategy';

export interface ILoadBalancerStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class LoadBalancerStrategyFactory {
  private _strategies: Map<string, () => ILoadBalancerStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new LoadBalancerDefaultStrategy());
    this._strategies.set('fast', () => new LoadBalancerFastStrategy());
    this._strategies.set('reliable', () => new LoadBalancerReliableStrategy());
    this._strategies.set('cached', () => new LoadBalancerCachedStrategy());
    this._strategies.set('batch', () => new LoadBalancerBatchStrategy());
  }

  create(name: string): ILoadBalancerStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown load-balancer strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ILoadBalancerStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ILoadBalancerStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ILoadBalancerStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ILoadBalancerStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
