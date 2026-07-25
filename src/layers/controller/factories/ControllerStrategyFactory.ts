/**
 * ControllerStrategyFactory
 *
 * Factory for creating Controller strategies by name.
 */

import { ControllerDefaultStrategy } from '../strategies/DefaultStrategy';
import { ControllerFastStrategy } from '../strategies/FastStrategy';
import { ControllerReliableStrategy } from '../strategies/ReliableStrategy';
import { ControllerCachedStrategy } from '../strategies/CachedStrategy';
import { ControllerBatchStrategy } from '../strategies/BatchStrategy';

export interface IControllerStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ControllerStrategyFactory {
  private _strategies: Map<string, () => IControllerStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ControllerDefaultStrategy());
    this._strategies.set('fast', () => new ControllerFastStrategy());
    this._strategies.set('reliable', () => new ControllerReliableStrategy());
    this._strategies.set('cached', () => new ControllerCachedStrategy());
    this._strategies.set('batch', () => new ControllerBatchStrategy());
  }

  create(name: string): IControllerStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown controller strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IControllerStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IControllerStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IControllerStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IControllerStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
