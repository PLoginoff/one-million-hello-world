/**
 * GovernanceStrategyFactory
 *
 * Factory for creating Governance strategies by name.
 */

import { GovernanceDefaultStrategy } from '../strategies/DefaultStrategy';
import { GovernanceFastStrategy } from '../strategies/FastStrategy';
import { GovernanceReliableStrategy } from '../strategies/ReliableStrategy';
import { GovernanceCachedStrategy } from '../strategies/CachedStrategy';
import { GovernanceBatchStrategy } from '../strategies/BatchStrategy';

export interface IGovernanceStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class GovernanceStrategyFactory {
  private _strategies: Map<string, () => IGovernanceStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new GovernanceDefaultStrategy());
    this._strategies.set('fast', () => new GovernanceFastStrategy());
    this._strategies.set('reliable', () => new GovernanceReliableStrategy());
    this._strategies.set('cached', () => new GovernanceCachedStrategy());
    this._strategies.set('batch', () => new GovernanceBatchStrategy());
  }

  create(name: string): IGovernanceStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown governance strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IGovernanceStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IGovernanceStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IGovernanceStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IGovernanceStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
