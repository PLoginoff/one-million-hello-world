/**
 * SnapshotStrategyFactory
 *
 * Factory for creating Snapshot strategies by name.
 */

import { SnapshotDefaultStrategy } from '../strategies/DefaultStrategy';
import { SnapshotFastStrategy } from '../strategies/FastStrategy';
import { SnapshotReliableStrategy } from '../strategies/ReliableStrategy';
import { SnapshotCachedStrategy } from '../strategies/CachedStrategy';
import { SnapshotBatchStrategy } from '../strategies/BatchStrategy';

export interface ISnapshotStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SnapshotStrategyFactory {
  private _strategies: Map<string, () => ISnapshotStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SnapshotDefaultStrategy());
    this._strategies.set('fast', () => new SnapshotFastStrategy());
    this._strategies.set('reliable', () => new SnapshotReliableStrategy());
    this._strategies.set('cached', () => new SnapshotCachedStrategy());
    this._strategies.set('batch', () => new SnapshotBatchStrategy());
  }

  create(name: string): ISnapshotStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown snapshot strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ISnapshotStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISnapshotStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISnapshotStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISnapshotStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
