/**
 * ContractTestingStrategyFactory
 *
 * Factory for creating ContractTesting strategies by name.
 */

import { ContractTestingDefaultStrategy } from '../strategies/DefaultStrategy';
import { ContractTestingFastStrategy } from '../strategies/FastStrategy';
import { ContractTestingReliableStrategy } from '../strategies/ReliableStrategy';
import { ContractTestingCachedStrategy } from '../strategies/CachedStrategy';
import { ContractTestingBatchStrategy } from '../strategies/BatchStrategy';

export interface IContractTestingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ContractTestingStrategyFactory {
  private _strategies: Map<string, () => IContractTestingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ContractTestingDefaultStrategy());
    this._strategies.set('fast', () => new ContractTestingFastStrategy());
    this._strategies.set('reliable', () => new ContractTestingReliableStrategy());
    this._strategies.set('cached', () => new ContractTestingCachedStrategy());
    this._strategies.set('batch', () => new ContractTestingBatchStrategy());
  }

  create(name: string): IContractTestingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown contract-testing strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IContractTestingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IContractTestingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IContractTestingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IContractTestingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
