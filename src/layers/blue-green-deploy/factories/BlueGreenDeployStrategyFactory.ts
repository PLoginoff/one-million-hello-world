/**
 * BlueGreenDeployStrategyFactory
 *
 * Factory for creating BlueGreenDeploy strategies by name.
 */

import { BlueGreenDeployDefaultStrategy } from '../strategies/DefaultStrategy';
import { BlueGreenDeployFastStrategy } from '../strategies/FastStrategy';
import { BlueGreenDeployReliableStrategy } from '../strategies/ReliableStrategy';
import { BlueGreenDeployCachedStrategy } from '../strategies/CachedStrategy';
import { BlueGreenDeployBatchStrategy } from '../strategies/BatchStrategy';

export interface IBlueGreenDeployStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class BlueGreenDeployStrategyFactory {
  private _strategies: Map<string, () => IBlueGreenDeployStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new BlueGreenDeployDefaultStrategy());
    this._strategies.set('fast', () => new BlueGreenDeployFastStrategy());
    this._strategies.set('reliable', () => new BlueGreenDeployReliableStrategy());
    this._strategies.set('cached', () => new BlueGreenDeployCachedStrategy());
    this._strategies.set('batch', () => new BlueGreenDeployBatchStrategy());
  }

  create(name: string): IBlueGreenDeployStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown blue-green-deploy strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IBlueGreenDeployStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IBlueGreenDeployStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IBlueGreenDeployStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IBlueGreenDeployStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
