/**
 * CompressionStrategyFactory
 *
 * Factory for creating Compression strategies by name.
 */

import { CompressionDefaultStrategy } from '../strategies/DefaultStrategy';
import { CompressionFastStrategy } from '../strategies/FastStrategy';
import { CompressionReliableStrategy } from '../strategies/ReliableStrategy';
import { CompressionCachedStrategy } from '../strategies/CachedStrategy';
import { CompressionBatchStrategy } from '../strategies/BatchStrategy';

export interface ICompressionStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class CompressionStrategyFactory {
  private _strategies: Map<string, () => ICompressionStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new CompressionDefaultStrategy());
    this._strategies.set('fast', () => new CompressionFastStrategy());
    this._strategies.set('reliable', () => new CompressionReliableStrategy());
    this._strategies.set('cached', () => new CompressionCachedStrategy());
    this._strategies.set('batch', () => new CompressionBatchStrategy());
  }

  create(name: string): ICompressionStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown compression strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ICompressionStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ICompressionStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ICompressionStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ICompressionStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
