/**
 * SpecificationStrategyFactory
 *
 * Factory for creating Specification strategies by name.
 */

import { SpecificationDefaultStrategy } from '../strategies/DefaultStrategy';
import { SpecificationFastStrategy } from '../strategies/FastStrategy';
import { SpecificationReliableStrategy } from '../strategies/ReliableStrategy';
import { SpecificationCachedStrategy } from '../strategies/CachedStrategy';
import { SpecificationBatchStrategy } from '../strategies/BatchStrategy';

export interface ISpecificationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SpecificationStrategyFactory {
  private _strategies: Map<string, () => ISpecificationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SpecificationDefaultStrategy());
    this._strategies.set('fast', () => new SpecificationFastStrategy());
    this._strategies.set('reliable', () => new SpecificationReliableStrategy());
    this._strategies.set('cached', () => new SpecificationCachedStrategy());
    this._strategies.set('batch', () => new SpecificationBatchStrategy());
  }

  create(name: string): ISpecificationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown specification strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ISpecificationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISpecificationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISpecificationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISpecificationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
