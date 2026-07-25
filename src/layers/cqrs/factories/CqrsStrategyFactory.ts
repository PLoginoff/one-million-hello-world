/**
 * CqrsStrategyFactory
 *
 * Factory for creating Cqrs strategies by name.
 */

import { CqrsDefaultStrategy } from '../strategies/DefaultStrategy';
import { CqrsFastStrategy } from '../strategies/FastStrategy';
import { CqrsReliableStrategy } from '../strategies/ReliableStrategy';
import { CqrsCachedStrategy } from '../strategies/CachedStrategy';
import { CqrsBatchStrategy } from '../strategies/BatchStrategy';

export interface ICqrsStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class CqrsStrategyFactory {
  private _strategies: Map<string, () => ICqrsStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new CqrsDefaultStrategy());
    this._strategies.set('fast', () => new CqrsFastStrategy());
    this._strategies.set('reliable', () => new CqrsReliableStrategy());
    this._strategies.set('cached', () => new CqrsCachedStrategy());
    this._strategies.set('batch', () => new CqrsBatchStrategy());
  }

  create(name: string): ICqrsStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown cqrs strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): ICqrsStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ICqrsStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ICqrsStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ICqrsStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
