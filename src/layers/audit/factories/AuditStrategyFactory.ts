/**
 * AuditStrategyFactory
 *
 * Factory for creating Audit strategies by name.
 */

import { AuditDefaultStrategy } from '../strategies/DefaultStrategy';
import { AuditFastStrategy } from '../strategies/FastStrategy';
import { AuditReliableStrategy } from '../strategies/ReliableStrategy';
import { AuditCachedStrategy } from '../strategies/CachedStrategy';
import { AuditBatchStrategy } from '../strategies/BatchStrategy';

export interface IAuditStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class AuditStrategyFactory {
  private _strategies: Map<string, () => IAuditStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new AuditDefaultStrategy());
    this._strategies.set('fast', () => new AuditFastStrategy());
    this._strategies.set('reliable', () => new AuditReliableStrategy());
    this._strategies.set('cached', () => new AuditCachedStrategy());
    this._strategies.set('batch', () => new AuditBatchStrategy());
  }

  create(name: string): IAuditStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown audit strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IAuditStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IAuditStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IAuditStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IAuditStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
