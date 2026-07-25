/**
 * BackupStrategyFactory
 *
 * Factory for creating Backup strategies by name.
 */

import { BackupDefaultStrategy } from '../strategies/DefaultStrategy';
import { BackupFastStrategy } from '../strategies/FastStrategy';
import { BackupReliableStrategy } from '../strategies/ReliableStrategy';
import { BackupCachedStrategy } from '../strategies/CachedStrategy';
import { BackupBatchStrategy } from '../strategies/BatchStrategy';

export interface IBackupStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class BackupStrategyFactory {
  private _strategies: Map<string, () => IBackupStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new BackupDefaultStrategy());
    this._strategies.set('fast', () => new BackupFastStrategy());
    this._strategies.set('reliable', () => new BackupReliableStrategy());
    this._strategies.set('cached', () => new BackupCachedStrategy());
    this._strategies.set('batch', () => new BackupBatchStrategy());
  }

  create(name: string): IBackupStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown backup strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IBackupStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IBackupStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IBackupStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IBackupStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
