/**
 * PolicyEngineStrategyFactory
 *
 * Factory for creating PolicyEngine strategies by name.
 */

import { PolicyEngineDefaultStrategy } from '../strategies/DefaultStrategy';
import { PolicyEngineFastStrategy } from '../strategies/FastStrategy';
import { PolicyEngineReliableStrategy } from '../strategies/ReliableStrategy';
import { PolicyEngineCachedStrategy } from '../strategies/CachedStrategy';
import { PolicyEngineBatchStrategy } from '../strategies/BatchStrategy';

export interface IPolicyEngineStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class PolicyEngineStrategyFactory {
  private _strategies: Map<string, () => IPolicyEngineStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new PolicyEngineDefaultStrategy());
    this._strategies.set('fast', () => new PolicyEngineFastStrategy());
    this._strategies.set('reliable', () => new PolicyEngineReliableStrategy());
    this._strategies.set('cached', () => new PolicyEngineCachedStrategy());
    this._strategies.set('batch', () => new PolicyEngineBatchStrategy());
  }

  create(name: string): IPolicyEngineStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown policy-engine strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IPolicyEngineStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IPolicyEngineStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IPolicyEngineStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IPolicyEngineStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
