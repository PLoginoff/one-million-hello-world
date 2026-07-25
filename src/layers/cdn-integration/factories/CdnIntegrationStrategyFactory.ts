/**
 * CdnIntegrationStrategyFactory
 *
 * Factory for creating CdnIntegration strategies by name.
 */

import { CdnIntegrationDefaultStrategy } from '../strategies/DefaultStrategy';
import { CdnIntegrationFastStrategy } from '../strategies/FastStrategy';
import { CdnIntegrationReliableStrategy } from '../strategies/ReliableStrategy';
import { CdnIntegrationCachedStrategy } from '../strategies/CachedStrategy';
import { CdnIntegrationBatchStrategy } from '../strategies/BatchStrategy';

export interface ICdnIntegrationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class CdnIntegrationStrategyFactory {
  private _strategies: Map<string, () => ICdnIntegrationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new CdnIntegrationDefaultStrategy());
    this._strategies.set('fast', () => new CdnIntegrationFastStrategy());
    this._strategies.set('reliable', () => new CdnIntegrationReliableStrategy());
    this._strategies.set('cached', () => new CdnIntegrationCachedStrategy());
    this._strategies.set('batch', () => new CdnIntegrationBatchStrategy());
  }

  create(name: string): ICdnIntegrationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown cdn-integration strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ICdnIntegrationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ICdnIntegrationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ICdnIntegrationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ICdnIntegrationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
