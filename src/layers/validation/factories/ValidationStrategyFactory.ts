/**
 * ValidationStrategyFactory
 *
 * Factory for creating Validation strategies by name.
 */

import { ValidationDefaultStrategy } from '../strategies/DefaultStrategy';
import { ValidationFastStrategy } from '../strategies/FastStrategy';
import { ValidationReliableStrategy } from '../strategies/ReliableStrategy';
import { ValidationCachedStrategy } from '../strategies/CachedStrategy';
import { ValidationBatchStrategy } from '../strategies/BatchStrategy';

export interface IValidationLegacyStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ValidationStrategyFactory {
  private _strategies: Map<string, () => IValidationLegacyStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ValidationDefaultStrategy());
    this._strategies.set('fast', () => new ValidationFastStrategy());
    this._strategies.set('reliable', () => new ValidationReliableStrategy());
    this._strategies.set('cached', () => new ValidationCachedStrategy());
    this._strategies.set('batch', () => new ValidationBatchStrategy());
  }

  create(name: string): IValidationLegacyStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown validation strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IValidationLegacyStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IValidationLegacyStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IValidationLegacyStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IValidationLegacyStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
