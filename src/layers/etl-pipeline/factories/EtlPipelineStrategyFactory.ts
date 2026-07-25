/**
 * EtlPipelineStrategyFactory
 *
 * Factory for creating EtlPipeline strategies by name.
 */

import { EtlPipelineDefaultStrategy } from '../strategies/DefaultStrategy';
import { EtlPipelineFastStrategy } from '../strategies/FastStrategy';
import { EtlPipelineReliableStrategy } from '../strategies/ReliableStrategy';
import { EtlPipelineCachedStrategy } from '../strategies/CachedStrategy';
import { EtlPipelineBatchStrategy } from '../strategies/BatchStrategy';

export interface IEtlPipelineStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class EtlPipelineStrategyFactory {
  private _strategies: Map<string, () => IEtlPipelineStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new EtlPipelineDefaultStrategy());
    this._strategies.set('fast', () => new EtlPipelineFastStrategy());
    this._strategies.set('reliable', () => new EtlPipelineReliableStrategy());
    this._strategies.set('cached', () => new EtlPipelineCachedStrategy());
    this._strategies.set('batch', () => new EtlPipelineBatchStrategy());
  }

  create(name: string): IEtlPipelineStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown etl-pipeline strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IEtlPipelineStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IEtlPipelineStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IEtlPipelineStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IEtlPipelineStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
