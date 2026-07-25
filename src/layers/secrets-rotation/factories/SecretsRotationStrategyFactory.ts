/**
 * SecretsRotationStrategyFactory
 *
 * Factory for creating SecretsRotation strategies by name.
 */

import { SecretsRotationDefaultStrategy } from '../strategies/DefaultStrategy';
import { SecretsRotationFastStrategy } from '../strategies/FastStrategy';
import { SecretsRotationReliableStrategy } from '../strategies/ReliableStrategy';
import { SecretsRotationCachedStrategy } from '../strategies/CachedStrategy';
import { SecretsRotationBatchStrategy } from '../strategies/BatchStrategy';

export interface ISecretsRotationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SecretsRotationStrategyFactory {
  private _strategies: Map<string, () => ISecretsRotationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SecretsRotationDefaultStrategy());
    this._strategies.set('fast', () => new SecretsRotationFastStrategy());
    this._strategies.set('reliable', () => new SecretsRotationReliableStrategy());
    this._strategies.set('cached', () => new SecretsRotationCachedStrategy());
    this._strategies.set('batch', () => new SecretsRotationBatchStrategy());
  }

  create(name: string): ISecretsRotationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown secrets-rotation strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ISecretsRotationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISecretsRotationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISecretsRotationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISecretsRotationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
