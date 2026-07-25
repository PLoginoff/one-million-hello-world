/**
 * AuthorizationStrategyFactory
 *
 * Factory for creating Authorization strategies by name.
 */

import { AuthorizationDefaultStrategy } from '../strategies/DefaultStrategy';
import { AuthorizationFastStrategy } from '../strategies/FastStrategy';
import { AuthorizationReliableStrategy } from '../strategies/ReliableStrategy';
import { AuthorizationCachedStrategy } from '../strategies/CachedStrategy';
import { AuthorizationBatchStrategy } from '../strategies/BatchStrategy';

export interface IAuthorizationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class AuthorizationStrategyFactory {
  private _strategies: Map<string, () => IAuthorizationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new AuthorizationDefaultStrategy());
    this._strategies.set('fast', () => new AuthorizationFastStrategy());
    this._strategies.set('reliable', () => new AuthorizationReliableStrategy());
    this._strategies.set('cached', () => new AuthorizationCachedStrategy());
    this._strategies.set('batch', () => new AuthorizationBatchStrategy());
  }

  create(name: string): IAuthorizationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown authorization strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IAuthorizationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IAuthorizationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IAuthorizationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IAuthorizationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
