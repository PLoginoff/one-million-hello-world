/**
 * MigrationsStrategyFactory
 *
 * Factory for creating Migrations strategies by name.
 */

import { MigrationsDefaultStrategy } from '../strategies/DefaultStrategy';
import { MigrationsFastStrategy } from '../strategies/FastStrategy';
import { MigrationsReliableStrategy } from '../strategies/ReliableStrategy';
import { MigrationsCachedStrategy } from '../strategies/CachedStrategy';
import { MigrationsBatchStrategy } from '../strategies/BatchStrategy';

export interface IMigrationsStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class MigrationsStrategyFactory {
  private _strategies: Map<string, () => IMigrationsStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new MigrationsDefaultStrategy());
    this._strategies.set('fast', () => new MigrationsFastStrategy());
    this._strategies.set('reliable', () => new MigrationsReliableStrategy());
    this._strategies.set('cached', () => new MigrationsCachedStrategy());
    this._strategies.set('batch', () => new MigrationsBatchStrategy());
  }

  create(name: string): IMigrationsStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown migrations strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IMigrationsStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IMigrationsStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IMigrationsStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IMigrationsStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
