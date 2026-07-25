/**
 * BatchProcessingStrategyFactory
 *
 * Factory for creating BatchProcessing strategies by name.
 */

import { BatchProcessingDefaultStrategy } from '../strategies/DefaultStrategy';
import { BatchProcessingFastStrategy } from '../strategies/FastStrategy';
import { BatchProcessingReliableStrategy } from '../strategies/ReliableStrategy';
import { BatchProcessingCachedStrategy } from '../strategies/CachedStrategy';
import { BatchProcessingBatchStrategy } from '../strategies/BatchStrategy';

export interface IBatchProcessingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class BatchProcessingStrategyFactory {
  private _strategies: Map<string, () => IBatchProcessingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new BatchProcessingDefaultStrategy());
    this._strategies.set('fast', () => new BatchProcessingFastStrategy());
    this._strategies.set('reliable', () => new BatchProcessingReliableStrategy());
    this._strategies.set('cached', () => new BatchProcessingCachedStrategy());
    this._strategies.set('batch', () => new BatchProcessingBatchStrategy());
  }

  create(name: string): IBatchProcessingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown batch-processing strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IBatchProcessingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IBatchProcessingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IBatchProcessingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IBatchProcessingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
