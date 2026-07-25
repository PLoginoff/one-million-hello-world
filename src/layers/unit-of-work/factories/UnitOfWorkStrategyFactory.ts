/**
 * UnitOfWorkStrategyFactory
 *
 * Factory for creating UnitOfWork strategies by name.
 */

import { UnitOfWorkDefaultStrategy } from '../strategies/DefaultStrategy';
import { UnitOfWorkFastStrategy } from '../strategies/FastStrategy';
import { UnitOfWorkReliableStrategy } from '../strategies/ReliableStrategy';
import { UnitOfWorkCachedStrategy } from '../strategies/CachedStrategy';
import { UnitOfWorkBatchStrategy } from '../strategies/BatchStrategy';

export interface IUnitOfWorkStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class UnitOfWorkStrategyFactory {
  private _strategies: Map<string, () => IUnitOfWorkStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new UnitOfWorkDefaultStrategy());
    this._strategies.set('fast', () => new UnitOfWorkFastStrategy());
    this._strategies.set('reliable', () => new UnitOfWorkReliableStrategy());
    this._strategies.set('cached', () => new UnitOfWorkCachedStrategy());
    this._strategies.set('batch', () => new UnitOfWorkBatchStrategy());
  }

  create(name: string): IUnitOfWorkStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown unit-of-work strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IUnitOfWorkStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IUnitOfWorkStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IUnitOfWorkStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IUnitOfWorkStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
