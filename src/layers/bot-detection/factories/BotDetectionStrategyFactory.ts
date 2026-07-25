/**
 * BotDetectionStrategyFactory
 *
 * Factory for creating BotDetection strategies by name.
 */

import { BotDetectionDefaultStrategy } from '../strategies/DefaultStrategy';
import { BotDetectionFastStrategy } from '../strategies/FastStrategy';
import { BotDetectionReliableStrategy } from '../strategies/ReliableStrategy';
import { BotDetectionCachedStrategy } from '../strategies/CachedStrategy';
import { BotDetectionBatchStrategy } from '../strategies/BatchStrategy';

export interface IBotDetectionStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class BotDetectionStrategyFactory {
  private _strategies: Map<string, () => IBotDetectionStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new BotDetectionDefaultStrategy());
    this._strategies.set('fast', () => new BotDetectionFastStrategy());
    this._strategies.set('reliable', () => new BotDetectionReliableStrategy());
    this._strategies.set('cached', () => new BotDetectionCachedStrategy());
    this._strategies.set('batch', () => new BotDetectionBatchStrategy());
  }

  create(name: string): IBotDetectionStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown bot-detection strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IBotDetectionStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IBotDetectionStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IBotDetectionStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IBotDetectionStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
