/**
 * MfaStrategyFactory
 *
 * Factory for creating Mfa strategies by name.
 */

import { MfaDefaultStrategy } from '../strategies/DefaultStrategy';
import { MfaFastStrategy } from '../strategies/FastStrategy';
import { MfaReliableStrategy } from '../strategies/ReliableStrategy';
import { MfaCachedStrategy } from '../strategies/CachedStrategy';
import { MfaBatchStrategy } from '../strategies/BatchStrategy';

export interface IMfaStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class MfaStrategyFactory {
  private _strategies: Map<string, () => IMfaStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new MfaDefaultStrategy());
    this._strategies.set('fast', () => new MfaFastStrategy());
    this._strategies.set('reliable', () => new MfaReliableStrategy());
    this._strategies.set('cached', () => new MfaCachedStrategy());
    this._strategies.set('batch', () => new MfaBatchStrategy());
  }

  create(name: string): IMfaStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown mfa strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IMfaStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IMfaStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IMfaStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IMfaStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
