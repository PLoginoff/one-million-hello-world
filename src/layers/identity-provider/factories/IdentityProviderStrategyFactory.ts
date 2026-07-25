/**
 * IdentityProviderStrategyFactory
 *
 * Factory for creating IdentityProvider strategies by name.
 */

import { IdentityProviderDefaultStrategy } from '../strategies/DefaultStrategy';
import { IdentityProviderFastStrategy } from '../strategies/FastStrategy';
import { IdentityProviderReliableStrategy } from '../strategies/ReliableStrategy';
import { IdentityProviderCachedStrategy } from '../strategies/CachedStrategy';
import { IdentityProviderBatchStrategy } from '../strategies/BatchStrategy';

export interface IIdentityProviderStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class IdentityProviderStrategyFactory {
  private _strategies: Map<string, () => IIdentityProviderStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new IdentityProviderDefaultStrategy());
    this._strategies.set('fast', () => new IdentityProviderFastStrategy());
    this._strategies.set('reliable', () => new IdentityProviderReliableStrategy());
    this._strategies.set('cached', () => new IdentityProviderCachedStrategy());
    this._strategies.set('batch', () => new IdentityProviderBatchStrategy());
  }

  create(name: string): IIdentityProviderStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown identity-provider strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IIdentityProviderStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IIdentityProviderStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IIdentityProviderStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IIdentityProviderStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
