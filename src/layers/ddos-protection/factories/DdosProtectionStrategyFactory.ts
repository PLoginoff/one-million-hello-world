/**
 * DdosProtectionStrategyFactory
 *
 * Factory for creating DdosProtection strategies by name.
 */

import { DdosProtectionDefaultStrategy } from '../strategies/DefaultStrategy';
import { DdosProtectionFastStrategy } from '../strategies/FastStrategy';
import { DdosProtectionReliableStrategy } from '../strategies/ReliableStrategy';
import { DdosProtectionCachedStrategy } from '../strategies/CachedStrategy';
import { DdosProtectionBatchStrategy } from '../strategies/BatchStrategy';

export interface IDdosProtectionStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DdosProtectionStrategyFactory {
  private _strategies: Map<string, () => IDdosProtectionStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DdosProtectionDefaultStrategy());
    this._strategies.set('fast', () => new DdosProtectionFastStrategy());
    this._strategies.set('reliable', () => new DdosProtectionReliableStrategy());
    this._strategies.set('cached', () => new DdosProtectionCachedStrategy());
    this._strategies.set('batch', () => new DdosProtectionBatchStrategy());
  }

  create(name: string): IDdosProtectionStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown ddos-protection strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IDdosProtectionStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDdosProtectionStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDdosProtectionStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDdosProtectionStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
