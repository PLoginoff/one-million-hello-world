/**
 * SchedulingStrategyFactory
 *
 * Factory for creating Scheduling strategies by name.
 */

import { SchedulingDefaultStrategy } from '../strategies/DefaultStrategy';
import { SchedulingFastStrategy } from '../strategies/FastStrategy';
import { SchedulingReliableStrategy } from '../strategies/ReliableStrategy';
import { SchedulingCachedStrategy } from '../strategies/CachedStrategy';
import { SchedulingBatchStrategy } from '../strategies/BatchStrategy';

export interface ISchedulingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SchedulingStrategyFactory {
  private _strategies: Map<string, () => ISchedulingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SchedulingDefaultStrategy());
    this._strategies.set('fast', () => new SchedulingFastStrategy());
    this._strategies.set('reliable', () => new SchedulingReliableStrategy());
    this._strategies.set('cached', () => new SchedulingCachedStrategy());
    this._strategies.set('batch', () => new SchedulingBatchStrategy());
  }

  create(name: string): ISchedulingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown scheduling strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ISchedulingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISchedulingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISchedulingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISchedulingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
