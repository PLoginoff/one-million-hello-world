/**
 * CanaryDeployStrategyFactory
 *
 * Factory for creating CanaryDeploy strategies by name.
 */

import { CanaryDeployDefaultStrategy } from '../strategies/DefaultStrategy';
import { CanaryDeployFastStrategy } from '../strategies/FastStrategy';
import { CanaryDeployReliableStrategy } from '../strategies/ReliableStrategy';
import { CanaryDeployCachedStrategy } from '../strategies/CachedStrategy';
import { CanaryDeployBatchStrategy } from '../strategies/BatchStrategy';

export interface ICanaryDeployStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class CanaryDeployStrategyFactory {
  private _strategies: Map<string, () => ICanaryDeployStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new CanaryDeployDefaultStrategy());
    this._strategies.set('fast', () => new CanaryDeployFastStrategy());
    this._strategies.set('reliable', () => new CanaryDeployReliableStrategy());
    this._strategies.set('cached', () => new CanaryDeployCachedStrategy());
    this._strategies.set('batch', () => new CanaryDeployBatchStrategy());
  }

  create(name: string): ICanaryDeployStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown canary-deploy strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ICanaryDeployStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ICanaryDeployStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ICanaryDeployStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ICanaryDeployStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
