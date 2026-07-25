/**
 * TransportStrategyFactory
 *
 * Factory for creating Transport strategies by name.
 */

import { TransportDefaultStrategy } from '../strategies/DefaultStrategy';
import { TransportFastStrategy } from '../strategies/FastStrategy';
import { TransportReliableStrategy } from '../strategies/ReliableStrategy';
import { TransportCachedStrategy } from '../strategies/CachedStrategy';
import { TransportBatchStrategy } from '../strategies/BatchStrategy';

export interface ITransportStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class TransportStrategyFactory {
  private _strategies: Map<string, () => ITransportStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new TransportDefaultStrategy());
    this._strategies.set('fast', () => new TransportFastStrategy());
    this._strategies.set('reliable', () => new TransportReliableStrategy());
    this._strategies.set('cached', () => new TransportCachedStrategy());
    this._strategies.set('batch', () => new TransportBatchStrategy());
  }

  create(name: string): ITransportStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown transport strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ITransportStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ITransportStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ITransportStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ITransportStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
