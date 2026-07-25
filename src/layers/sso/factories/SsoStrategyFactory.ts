/**
 * SsoStrategyFactory
 *
 * Factory for creating Sso strategies by name.
 */

import { SsoDefaultStrategy } from '../strategies/DefaultStrategy';
import { SsoFastStrategy } from '../strategies/FastStrategy';
import { SsoReliableStrategy } from '../strategies/ReliableStrategy';
import { SsoCachedStrategy } from '../strategies/CachedStrategy';
import { SsoBatchStrategy } from '../strategies/BatchStrategy';

export interface ISsoStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SsoStrategyFactory {
  private _strategies: Map<string, () => ISsoStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SsoDefaultStrategy());
    this._strategies.set('fast', () => new SsoFastStrategy());
    this._strategies.set('reliable', () => new SsoReliableStrategy());
    this._strategies.set('cached', () => new SsoCachedStrategy());
    this._strategies.set('batch', () => new SsoBatchStrategy());
  }

  create(name: string): ISsoStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown sso strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): ISsoStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISsoStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISsoStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISsoStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
