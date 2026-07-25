/**
 * NetworkStrategyFactory
 *
 * Factory for creating Network strategies by name.
 */

import { NetworkDefaultStrategy } from '../strategies/DefaultStrategy';
import { NetworkFastStrategy } from '../strategies/FastStrategy';
import { NetworkReliableStrategy } from '../strategies/ReliableStrategy';
import { NetworkCachedStrategy } from '../strategies/CachedStrategy';
import { NetworkBatchStrategy } from '../strategies/BatchStrategy';

export interface INetworkStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class NetworkStrategyFactory {
  private _strategies: Map<string, () => INetworkStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new NetworkDefaultStrategy());
    this._strategies.set('fast', () => new NetworkFastStrategy());
    this._strategies.set('reliable', () => new NetworkReliableStrategy());
    this._strategies.set('cached', () => new NetworkCachedStrategy());
    this._strategies.set('batch', () => new NetworkBatchStrategy());
  }

  create(name: string): INetworkStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown network strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): INetworkStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => INetworkStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): INetworkStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): INetworkStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
