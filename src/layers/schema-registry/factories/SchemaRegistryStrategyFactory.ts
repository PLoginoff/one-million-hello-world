/**
 * SchemaRegistryStrategyFactory
 *
 * Factory for creating SchemaRegistry strategies by name.
 */

import { SchemaRegistryDefaultStrategy } from '../strategies/DefaultStrategy';
import { SchemaRegistryFastStrategy } from '../strategies/FastStrategy';
import { SchemaRegistryReliableStrategy } from '../strategies/ReliableStrategy';
import { SchemaRegistryCachedStrategy } from '../strategies/CachedStrategy';
import { SchemaRegistryBatchStrategy } from '../strategies/BatchStrategy';

export interface ISchemaRegistryStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SchemaRegistryStrategyFactory {
  private _strategies: Map<string, () => ISchemaRegistryStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SchemaRegistryDefaultStrategy());
    this._strategies.set('fast', () => new SchemaRegistryFastStrategy());
    this._strategies.set('reliable', () => new SchemaRegistryReliableStrategy());
    this._strategies.set('cached', () => new SchemaRegistryCachedStrategy());
    this._strategies.set('batch', () => new SchemaRegistryBatchStrategy());
  }

  create(name: string): ISchemaRegistryStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown schema-registry strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ISchemaRegistryStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISchemaRegistryStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISchemaRegistryStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISchemaRegistryStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
