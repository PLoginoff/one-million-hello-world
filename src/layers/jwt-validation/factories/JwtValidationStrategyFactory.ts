/**
 * JwtValidationStrategyFactory
 *
 * Factory for creating JwtValidation strategies by name.
 */

import { JwtValidationDefaultStrategy } from '../strategies/DefaultStrategy';
import { JwtValidationFastStrategy } from '../strategies/FastStrategy';
import { JwtValidationReliableStrategy } from '../strategies/ReliableStrategy';
import { JwtValidationCachedStrategy } from '../strategies/CachedStrategy';
import { JwtValidationBatchStrategy } from '../strategies/BatchStrategy';

export interface IJwtValidationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class JwtValidationStrategyFactory {
  private _strategies: Map<string, () => IJwtValidationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new JwtValidationDefaultStrategy());
    this._strategies.set('fast', () => new JwtValidationFastStrategy());
    this._strategies.set('reliable', () => new JwtValidationReliableStrategy());
    this._strategies.set('cached', () => new JwtValidationCachedStrategy());
    this._strategies.set('batch', () => new JwtValidationBatchStrategy());
  }

  create(name: string): IJwtValidationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown jwt-validation strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IJwtValidationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IJwtValidationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IJwtValidationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IJwtValidationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
