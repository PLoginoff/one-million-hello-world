/**
 * DeadLetterStrategyFactory
 *
 * Factory for creating DeadLetter strategies by name.
 */

import { DeadLetterDefaultStrategy } from '../strategies/DefaultStrategy';
import { DeadLetterFastStrategy } from '../strategies/FastStrategy';
import { DeadLetterReliableStrategy } from '../strategies/ReliableStrategy';
import { DeadLetterCachedStrategy } from '../strategies/CachedStrategy';
import { DeadLetterBatchStrategy } from '../strategies/BatchStrategy';

export interface IDeadLetterStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DeadLetterStrategyFactory {
  private _strategies: Map<string, () => IDeadLetterStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DeadLetterDefaultStrategy());
    this._strategies.set('fast', () => new DeadLetterFastStrategy());
    this._strategies.set('reliable', () => new DeadLetterReliableStrategy());
    this._strategies.set('cached', () => new DeadLetterCachedStrategy());
    this._strategies.set('batch', () => new DeadLetterBatchStrategy());
  }

  create(name: string): IDeadLetterStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown dead-letter strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IDeadLetterStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDeadLetterStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDeadLetterStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDeadLetterStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
