/**
 * RulesEngineStrategyFactory
 *
 * Factory for creating RulesEngine strategies by name.
 */

import { RulesEngineDefaultStrategy } from '../strategies/DefaultStrategy';
import { RulesEngineFastStrategy } from '../strategies/FastStrategy';
import { RulesEngineReliableStrategy } from '../strategies/ReliableStrategy';
import { RulesEngineCachedStrategy } from '../strategies/CachedStrategy';
import { RulesEngineBatchStrategy } from '../strategies/BatchStrategy';

export interface IRulesEngineStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class RulesEngineStrategyFactory {
  private _strategies: Map<string, () => IRulesEngineStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new RulesEngineDefaultStrategy());
    this._strategies.set('fast', () => new RulesEngineFastStrategy());
    this._strategies.set('reliable', () => new RulesEngineReliableStrategy());
    this._strategies.set('cached', () => new RulesEngineCachedStrategy());
    this._strategies.set('batch', () => new RulesEngineBatchStrategy());
  }

  create(name: string): IRulesEngineStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown rules-engine strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IRulesEngineStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IRulesEngineStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IRulesEngineStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IRulesEngineStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
