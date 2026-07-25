/**
 * StreamProcessingStrategyFactory
 *
 * Factory for creating StreamProcessing strategies by name.
 */

import { StreamProcessingDefaultStrategy } from '../strategies/DefaultStrategy';
import { StreamProcessingFastStrategy } from '../strategies/FastStrategy';
import { StreamProcessingReliableStrategy } from '../strategies/ReliableStrategy';
import { StreamProcessingCachedStrategy } from '../strategies/CachedStrategy';
import { StreamProcessingBatchStrategy } from '../strategies/BatchStrategy';

export interface IStreamProcessingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class StreamProcessingStrategyFactory {
  private _strategies: Map<string, () => IStreamProcessingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new StreamProcessingDefaultStrategy());
    this._strategies.set('fast', () => new StreamProcessingFastStrategy());
    this._strategies.set('reliable', () => new StreamProcessingReliableStrategy());
    this._strategies.set('cached', () => new StreamProcessingCachedStrategy());
    this._strategies.set('batch', () => new StreamProcessingBatchStrategy());
  }

  create(name: string): IStreamProcessingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown stream-processing strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IStreamProcessingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IStreamProcessingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IStreamProcessingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IStreamProcessingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
