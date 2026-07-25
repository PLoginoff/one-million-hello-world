/**
 * SecretsStrategyFactory
 *
 * Factory for creating Secrets strategies by name.
 */

import { SecretsDefaultStrategy } from '../strategies/DefaultStrategy';
import { SecretsFastStrategy } from '../strategies/FastStrategy';
import { SecretsReliableStrategy } from '../strategies/ReliableStrategy';
import { SecretsCachedStrategy } from '../strategies/CachedStrategy';
import { SecretsBatchStrategy } from '../strategies/BatchStrategy';

export interface ISecretsStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SecretsStrategyFactory {
  private _strategies: Map<string, () => ISecretsStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SecretsDefaultStrategy());
    this._strategies.set('fast', () => new SecretsFastStrategy());
    this._strategies.set('reliable', () => new SecretsReliableStrategy());
    this._strategies.set('cached', () => new SecretsCachedStrategy());
    this._strategies.set('batch', () => new SecretsBatchStrategy());
  }

  create(name: string): ISecretsStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown secrets strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): ISecretsStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISecretsStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISecretsStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISecretsStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
