/**
 * PropertyTestingStrategyFactory
 *
 * Factory for creating PropertyTesting strategies by name.
 */

import { PropertyTestingDefaultStrategy } from '../strategies/DefaultStrategy';
import { PropertyTestingFastStrategy } from '../strategies/FastStrategy';
import { PropertyTestingReliableStrategy } from '../strategies/ReliableStrategy';
import { PropertyTestingCachedStrategy } from '../strategies/CachedStrategy';
import { PropertyTestingBatchStrategy } from '../strategies/BatchStrategy';

export interface IPropertyTestingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class PropertyTestingStrategyFactory {
  private _strategies: Map<string, () => IPropertyTestingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new PropertyTestingDefaultStrategy());
    this._strategies.set('fast', () => new PropertyTestingFastStrategy());
    this._strategies.set('reliable', () => new PropertyTestingReliableStrategy());
    this._strategies.set('cached', () => new PropertyTestingCachedStrategy());
    this._strategies.set('batch', () => new PropertyTestingBatchStrategy());
  }

  create(name: string): IPropertyTestingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown property-testing strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IPropertyTestingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IPropertyTestingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IPropertyTestingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IPropertyTestingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
