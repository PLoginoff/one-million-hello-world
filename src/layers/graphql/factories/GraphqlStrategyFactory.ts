/**
 * GraphqlStrategyFactory
 *
 * Factory for creating Graphql strategies by name.
 */

import { GraphqlDefaultStrategy } from '../strategies/DefaultStrategy';
import { GraphqlFastStrategy } from '../strategies/FastStrategy';
import { GraphqlReliableStrategy } from '../strategies/ReliableStrategy';
import { GraphqlCachedStrategy } from '../strategies/CachedStrategy';
import { GraphqlBatchStrategy } from '../strategies/BatchStrategy';

export interface IGraphqlStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class GraphqlStrategyFactory {
  private _strategies: Map<string, () => IGraphqlStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new GraphqlDefaultStrategy());
    this._strategies.set('fast', () => new GraphqlFastStrategy());
    this._strategies.set('reliable', () => new GraphqlReliableStrategy());
    this._strategies.set('cached', () => new GraphqlCachedStrategy());
    this._strategies.set('batch', () => new GraphqlBatchStrategy());
  }

  create(name: string): IGraphqlStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown graphql strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IGraphqlStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IGraphqlStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IGraphqlStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IGraphqlStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
