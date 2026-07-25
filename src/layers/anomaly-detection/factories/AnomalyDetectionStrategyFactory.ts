/**
 * AnomalyDetectionStrategyFactory
 *
 * Factory for creating AnomalyDetection strategies by name.
 */

import { AnomalyDetectionDefaultStrategy } from '../strategies/DefaultStrategy';
import { AnomalyDetectionFastStrategy } from '../strategies/FastStrategy';
import { AnomalyDetectionReliableStrategy } from '../strategies/ReliableStrategy';
import { AnomalyDetectionCachedStrategy } from '../strategies/CachedStrategy';
import { AnomalyDetectionBatchStrategy } from '../strategies/BatchStrategy';

export interface IAnomalyDetectionStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class AnomalyDetectionStrategyFactory {
  private _strategies: Map<string, () => IAnomalyDetectionStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new AnomalyDetectionDefaultStrategy());
    this._strategies.set('fast', () => new AnomalyDetectionFastStrategy());
    this._strategies.set('reliable', () => new AnomalyDetectionReliableStrategy());
    this._strategies.set('cached', () => new AnomalyDetectionCachedStrategy());
    this._strategies.set('batch', () => new AnomalyDetectionBatchStrategy());
  }

  create(name: string): IAnomalyDetectionStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown anomaly-detection strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IAnomalyDetectionStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IAnomalyDetectionStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IAnomalyDetectionStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IAnomalyDetectionStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
