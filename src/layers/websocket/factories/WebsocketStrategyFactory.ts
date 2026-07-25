/**
 * WebsocketStrategyFactory
 *
 * Factory for creating Websocket strategies by name.
 */

import { WebsocketDefaultStrategy } from '../strategies/DefaultStrategy';
import { WebsocketFastStrategy } from '../strategies/FastStrategy';
import { WebsocketReliableStrategy } from '../strategies/ReliableStrategy';
import { WebsocketCachedStrategy } from '../strategies/CachedStrategy';
import { WebsocketBatchStrategy } from '../strategies/BatchStrategy';

export interface IWebsocketStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class WebsocketStrategyFactory {
  private _strategies: Map<string, () => IWebsocketStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new WebsocketDefaultStrategy());
    this._strategies.set('fast', () => new WebsocketFastStrategy());
    this._strategies.set('reliable', () => new WebsocketReliableStrategy());
    this._strategies.set('cached', () => new WebsocketCachedStrategy());
    this._strategies.set('batch', () => new WebsocketBatchStrategy());
  }

  create(name: string): IWebsocketStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown websocket strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IWebsocketStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IWebsocketStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IWebsocketStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IWebsocketStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
