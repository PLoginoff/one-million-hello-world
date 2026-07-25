/**
 * Oauth2StrategyFactory
 *
 * Factory for creating Oauth2 strategies by name.
 */

import { Oauth2DefaultStrategy } from '../strategies/DefaultStrategy';
import { Oauth2FastStrategy } from '../strategies/FastStrategy';
import { Oauth2ReliableStrategy } from '../strategies/ReliableStrategy';
import { Oauth2CachedStrategy } from '../strategies/CachedStrategy';
import { Oauth2BatchStrategy } from '../strategies/BatchStrategy';

export interface IOauth2Strategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class Oauth2StrategyFactory {
  private _strategies: Map<string, () => IOauth2Strategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new Oauth2DefaultStrategy());
    this._strategies.set('fast', () => new Oauth2FastStrategy());
    this._strategies.set('reliable', () => new Oauth2ReliableStrategy());
    this._strategies.set('cached', () => new Oauth2CachedStrategy());
    this._strategies.set('batch', () => new Oauth2BatchStrategy());
  }

  create(name: string): IOauth2Strategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown oauth2 strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IOauth2Strategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IOauth2Strategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IOauth2Strategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IOauth2Strategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
