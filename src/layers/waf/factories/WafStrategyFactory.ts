/**
 * WafStrategyFactory
 *
 * Factory for creating Waf strategies by name.
 */

import { WafDefaultStrategy } from '../strategies/DefaultStrategy';
import { WafFastStrategy } from '../strategies/FastStrategy';
import { WafReliableStrategy } from '../strategies/ReliableStrategy';
import { WafCachedStrategy } from '../strategies/CachedStrategy';
import { WafBatchStrategy } from '../strategies/BatchStrategy';

export interface IWafStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class WafStrategyFactory {
  private _strategies: Map<string, () => IWafStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new WafDefaultStrategy());
    this._strategies.set('fast', () => new WafFastStrategy());
    this._strategies.set('reliable', () => new WafReliableStrategy());
    this._strategies.set('cached', () => new WafCachedStrategy());
    this._strategies.set('batch', () => new WafBatchStrategy());
  }

  create(name: string): IWafStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown waf strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IWafStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IWafStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IWafStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IWafStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
