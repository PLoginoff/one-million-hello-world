/**
 * ApiVersioningStrategyFactory
 *
 * Factory for creating ApiVersioning strategies by name.
 */

import { ApiVersioningDefaultStrategy } from '../strategies/DefaultStrategy';
import { ApiVersioningFastStrategy } from '../strategies/FastStrategy';
import { ApiVersioningReliableStrategy } from '../strategies/ReliableStrategy';
import { ApiVersioningCachedStrategy } from '../strategies/CachedStrategy';
import { ApiVersioningBatchStrategy } from '../strategies/BatchStrategy';

export interface IApiVersioningStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ApiVersioningStrategyFactory {
  private _strategies: Map<string, () => IApiVersioningStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ApiVersioningDefaultStrategy());
    this._strategies.set('fast', () => new ApiVersioningFastStrategy());
    this._strategies.set('reliable', () => new ApiVersioningReliableStrategy());
    this._strategies.set('cached', () => new ApiVersioningCachedStrategy());
    this._strategies.set('batch', () => new ApiVersioningBatchStrategy());
  }

  create(name: string): IApiVersioningStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown api-versioning strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IApiVersioningStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IApiVersioningStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IApiVersioningStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IApiVersioningStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
