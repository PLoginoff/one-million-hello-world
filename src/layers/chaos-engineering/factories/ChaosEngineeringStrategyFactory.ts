/**
 * ChaosEngineeringStrategyFactory
 *
 * Factory for creating ChaosEngineering strategies by name.
 */

import { ChaosEngineeringDefaultStrategy } from '../strategies/DefaultStrategy';
import { ChaosEngineeringFastStrategy } from '../strategies/FastStrategy';
import { ChaosEngineeringReliableStrategy } from '../strategies/ReliableStrategy';
import { ChaosEngineeringCachedStrategy } from '../strategies/CachedStrategy';
import { ChaosEngineeringBatchStrategy } from '../strategies/BatchStrategy';

export interface IChaosEngineeringStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ChaosEngineeringStrategyFactory {
  private _strategies: Map<string, () => IChaosEngineeringStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ChaosEngineeringDefaultStrategy());
    this._strategies.set('fast', () => new ChaosEngineeringFastStrategy());
    this._strategies.set('reliable', () => new ChaosEngineeringReliableStrategy());
    this._strategies.set('cached', () => new ChaosEngineeringCachedStrategy());
    this._strategies.set('batch', () => new ChaosEngineeringBatchStrategy());
  }

  create(name: string): IChaosEngineeringStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown chaos-engineering strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IChaosEngineeringStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IChaosEngineeringStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IChaosEngineeringStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IChaosEngineeringStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
