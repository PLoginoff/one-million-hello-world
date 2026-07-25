/**
 * FraudDetectionStrategyFactory
 *
 * Factory for creating FraudDetection strategies by name.
 */

import { FraudDetectionDefaultStrategy } from '../strategies/DefaultStrategy';
import { FraudDetectionFastStrategy } from '../strategies/FastStrategy';
import { FraudDetectionReliableStrategy } from '../strategies/ReliableStrategy';
import { FraudDetectionCachedStrategy } from '../strategies/CachedStrategy';
import { FraudDetectionBatchStrategy } from '../strategies/BatchStrategy';

export interface IFraudDetectionStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class FraudDetectionStrategyFactory {
  private _strategies: Map<string, () => IFraudDetectionStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new FraudDetectionDefaultStrategy());
    this._strategies.set('fast', () => new FraudDetectionFastStrategy());
    this._strategies.set('reliable', () => new FraudDetectionReliableStrategy());
    this._strategies.set('cached', () => new FraudDetectionCachedStrategy());
    this._strategies.set('batch', () => new FraudDetectionBatchStrategy());
  }

  create(name: string): IFraudDetectionStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown fraud-detection strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IFraudDetectionStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IFraudDetectionStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IFraudDetectionStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IFraudDetectionStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
