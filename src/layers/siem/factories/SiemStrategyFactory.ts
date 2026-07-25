/**
 * SiemStrategyFactory
 *
 * Factory for creating Siem strategies by name.
 */

import { SiemDefaultStrategy } from '../strategies/DefaultStrategy';
import { SiemFastStrategy } from '../strategies/FastStrategy';
import { SiemReliableStrategy } from '../strategies/ReliableStrategy';
import { SiemCachedStrategy } from '../strategies/CachedStrategy';
import { SiemBatchStrategy } from '../strategies/BatchStrategy';

export interface ISiemStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SiemStrategyFactory {
  private _strategies: Map<string, () => ISiemStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SiemDefaultStrategy());
    this._strategies.set('fast', () => new SiemFastStrategy());
    this._strategies.set('reliable', () => new SiemReliableStrategy());
    this._strategies.set('cached', () => new SiemCachedStrategy());
    this._strategies.set('batch', () => new SiemBatchStrategy());
  }

  create(name: string): ISiemStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown siem strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): ISiemStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISiemStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISiemStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISiemStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
