/**
 * ReportingStrategyFactory
 *
 * Factory for creating Reporting strategies by name.
 */

import { ReportingDefaultStrategy } from '../strategies/DefaultStrategy';
import { ReportingFastStrategy } from '../strategies/FastStrategy';
import { ReportingReliableStrategy } from '../strategies/ReliableStrategy';
import { ReportingCachedStrategy } from '../strategies/CachedStrategy';
import { ReportingBatchStrategy } from '../strategies/BatchStrategy';

export interface IReportingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class ReportingStrategyFactory {
  private _strategies: Map<string, () => IReportingStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new ReportingDefaultStrategy());
    this._strategies.set('fast', () => new ReportingFastStrategy());
    this._strategies.set('reliable', () => new ReportingReliableStrategy());
    this._strategies.set('cached', () => new ReportingCachedStrategy());
    this._strategies.set('batch', () => new ReportingBatchStrategy());
  }

  create(name: string): IReportingStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown reporting strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): IReportingStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IReportingStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IReportingStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IReportingStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
