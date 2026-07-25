/**
 * GitopsStrategyFactory
 *
 * Factory for creating Gitops strategies by name.
 */

import { GitopsDefaultStrategy } from '../strategies/DefaultStrategy';
import { GitopsFastStrategy } from '../strategies/FastStrategy';
import { GitopsReliableStrategy } from '../strategies/ReliableStrategy';
import { GitopsCachedStrategy } from '../strategies/CachedStrategy';
import { GitopsBatchStrategy } from '../strategies/BatchStrategy';

export interface IGitopsStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class GitopsStrategyFactory {
  private _strategies: Map<string, () => IGitopsStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new GitopsDefaultStrategy());
    this._strategies.set('fast', () => new GitopsFastStrategy());
    this._strategies.set('reliable', () => new GitopsReliableStrategy());
    this._strategies.set('cached', () => new GitopsCachedStrategy());
    this._strategies.set('batch', () => new GitopsBatchStrategy());
  }

  create(name: string): IGitopsStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown gitops strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IGitopsStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IGitopsStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IGitopsStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IGitopsStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
