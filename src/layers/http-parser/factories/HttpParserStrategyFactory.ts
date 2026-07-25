/**
 * HttpParserStrategyFactory
 *
 * Factory for creating HttpParser strategies by name.
 */

import { HttpParserDefaultStrategy } from '../strategies/DefaultStrategy';
import { HttpParserFastStrategy } from '../strategies/FastStrategy';
import { HttpParserReliableStrategy } from '../strategies/ReliableStrategy';
import { HttpParserCachedStrategy } from '../strategies/CachedStrategy';
import { HttpParserBatchStrategy } from '../strategies/BatchStrategy';

export interface IHttpParserStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class HttpParserStrategyFactory {
  private _strategies: Map<string, () => IHttpParserStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new HttpParserDefaultStrategy());
    this._strategies.set('fast', () => new HttpParserFastStrategy());
    this._strategies.set('reliable', () => new HttpParserReliableStrategy());
    this._strategies.set('cached', () => new HttpParserCachedStrategy());
    this._strategies.set('batch', () => new HttpParserBatchStrategy());
  }

  create(name: string): IHttpParserStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown http-parser strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IHttpParserStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IHttpParserStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IHttpParserStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IHttpParserStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
