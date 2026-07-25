/**
 * EncryptionStrategyFactory
 *
 * Factory for creating Encryption strategies by name.
 */

import { EncryptionDefaultStrategy } from '../strategies/DefaultStrategy';
import { EncryptionFastStrategy } from '../strategies/FastStrategy';
import { EncryptionReliableStrategy } from '../strategies/ReliableStrategy';
import { EncryptionCachedStrategy } from '../strategies/CachedStrategy';
import { EncryptionBatchStrategy } from '../strategies/BatchStrategy';

export interface IEncryptionStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class EncryptionStrategyFactory {
  private _strategies: Map<string, () => IEncryptionStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new EncryptionDefaultStrategy());
    this._strategies.set('fast', () => new EncryptionFastStrategy());
    this._strategies.set('reliable', () => new EncryptionReliableStrategy());
    this._strategies.set('cached', () => new EncryptionCachedStrategy());
    this._strategies.set('batch', () => new EncryptionBatchStrategy());
  }

  create(name: string): IEncryptionStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown encryption strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IEncryptionStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IEncryptionStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IEncryptionStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IEncryptionStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
