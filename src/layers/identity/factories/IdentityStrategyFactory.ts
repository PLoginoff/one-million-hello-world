/**
 * IdentityStrategyFactory
 *
 * Factory for creating Identity strategies by name.
 */

import { IdentityDefaultStrategy } from '../strategies/DefaultStrategy';
import { IdentityFastStrategy } from '../strategies/FastStrategy';
import { IdentityReliableStrategy } from '../strategies/ReliableStrategy';
import { IdentityCachedStrategy } from '../strategies/CachedStrategy';
import { IdentityBatchStrategy } from '../strategies/BatchStrategy';

export interface IIdentityStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class IdentityStrategyFactory {
  private _strategies: Map<string, () => IIdentityStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new IdentityDefaultStrategy());
    this._strategies.set('fast', () => new IdentityFastStrategy());
    this._strategies.set('reliable', () => new IdentityReliableStrategy());
    this._strategies.set('cached', () => new IdentityCachedStrategy());
    this._strategies.set('batch', () => new IdentityBatchStrategy());
  }

  create(name: string): IIdentityStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown identity strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IIdentityStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IIdentityStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IIdentityStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IIdentityStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
