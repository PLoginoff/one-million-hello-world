/**
 * SecurityStrategyFactory
 *
 * Factory for creating Security strategies by name.
 */

import { SecurityDefaultStrategy } from '../strategies/DefaultStrategy';
import { SecurityFastStrategy } from '../strategies/FastStrategy';
import { SecurityReliableStrategy } from '../strategies/ReliableStrategy';
import { SecurityCachedStrategy } from '../strategies/CachedStrategy';
import { SecurityBatchStrategy } from '../strategies/BatchStrategy';

export interface ISecurityStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class SecurityStrategyFactory {
  private _strategies: Map<string, () => ISecurityStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new SecurityDefaultStrategy());
    this._strategies.set('fast', () => new SecurityFastStrategy());
    this._strategies.set('reliable', () => new SecurityReliableStrategy());
    this._strategies.set('cached', () => new SecurityCachedStrategy());
    this._strategies.set('batch', () => new SecurityBatchStrategy());
  }

  create(name: string): ISecurityStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown security strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): ISecurityStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => ISecurityStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): ISecurityStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): ISecurityStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
