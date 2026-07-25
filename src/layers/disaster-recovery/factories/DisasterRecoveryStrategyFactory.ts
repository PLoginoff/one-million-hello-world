/**
 * DisasterRecoveryStrategyFactory
 *
 * Factory for creating DisasterRecovery strategies by name.
 */

import { DisasterRecoveryDefaultStrategy } from '../strategies/DefaultStrategy';
import { DisasterRecoveryFastStrategy } from '../strategies/FastStrategy';
import { DisasterRecoveryReliableStrategy } from '../strategies/ReliableStrategy';
import { DisasterRecoveryCachedStrategy } from '../strategies/CachedStrategy';
import { DisasterRecoveryBatchStrategy } from '../strategies/BatchStrategy';

export interface IDisasterRecoveryStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class DisasterRecoveryStrategyFactory {
  private _strategies: Map<string, () => IDisasterRecoveryStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new DisasterRecoveryDefaultStrategy());
    this._strategies.set('fast', () => new DisasterRecoveryFastStrategy());
    this._strategies.set('reliable', () => new DisasterRecoveryReliableStrategy());
    this._strategies.set('cached', () => new DisasterRecoveryCachedStrategy());
    this._strategies.set('batch', () => new DisasterRecoveryBatchStrategy());
  }

  create(name: string): IDisasterRecoveryStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown disaster-recovery strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IDisasterRecoveryStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IDisasterRecoveryStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IDisasterRecoveryStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IDisasterRecoveryStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
