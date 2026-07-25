/**
 * QueryObjectStrategyFactory
 *
 * Factory for creating QueryObject strategies by name.
 */

import { QueryObjectDefaultStrategy } from '../strategies/DefaultStrategy';
import { QueryObjectFastStrategy } from '../strategies/FastStrategy';
import { QueryObjectReliableStrategy } from '../strategies/ReliableStrategy';
import { QueryObjectCachedStrategy } from '../strategies/CachedStrategy';
import { QueryObjectBatchStrategy } from '../strategies/BatchStrategy';

export interface IQueryObjectStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class QueryObjectStrategyFactory {
  private _strategies: Map<string, () => IQueryObjectStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new QueryObjectDefaultStrategy());
    this._strategies.set('fast', () => new QueryObjectFastStrategy());
    this._strategies.set('reliable', () => new QueryObjectReliableStrategy());
    this._strategies.set('cached', () => new QueryObjectCachedStrategy());
    this._strategies.set('batch', () => new QueryObjectBatchStrategy());
  }

  create(name: string): IQueryObjectStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown query-object strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IQueryObjectStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IQueryObjectStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IQueryObjectStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IQueryObjectStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
