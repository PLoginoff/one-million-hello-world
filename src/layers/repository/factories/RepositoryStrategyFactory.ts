/**
 * RepositoryStrategyFactory
 *
 * Factory for creating Repository strategies by name.
 */

import { RepositoryDefaultStrategy } from '../strategies/DefaultStrategy';
import { RepositoryFastStrategy } from '../strategies/FastStrategy';
import { RepositoryReliableStrategy } from '../strategies/ReliableStrategy';
import { RepositoryCachedStrategy } from '../strategies/CachedStrategy';
import { RepositoryBatchStrategy } from '../strategies/BatchStrategy';

export interface IRepositoryLegacyStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class RepositoryStrategyFactory {
  private _strategies: Map<string, () => IRepositoryLegacyStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new RepositoryDefaultStrategy());
    this._strategies.set('fast', () => new RepositoryFastStrategy());
    this._strategies.set('reliable', () => new RepositoryReliableStrategy());
    this._strategies.set('cached', () => new RepositoryCachedStrategy());
    this._strategies.set('batch', () => new RepositoryBatchStrategy());
  }

  create(name: string): IRepositoryLegacyStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown repository strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IRepositoryLegacyStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IRepositoryLegacyStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IRepositoryLegacyStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IRepositoryLegacyStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
