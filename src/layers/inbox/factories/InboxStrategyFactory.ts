/**
 * InboxStrategyFactory
 *
 * Factory for creating Inbox strategies by name.
 */

import { InboxDefaultStrategy } from '../strategies/DefaultStrategy';
import { InboxFastStrategy } from '../strategies/FastStrategy';
import { InboxReliableStrategy } from '../strategies/ReliableStrategy';
import { InboxCachedStrategy } from '../strategies/CachedStrategy';
import { InboxBatchStrategy } from '../strategies/BatchStrategy';

export interface IInboxStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class InboxStrategyFactory {
  private _strategies: Map<string, () => IInboxStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new InboxDefaultStrategy());
    this._strategies.set('fast', () => new InboxFastStrategy());
    this._strategies.set('reliable', () => new InboxReliableStrategy());
    this._strategies.set('cached', () => new InboxCachedStrategy());
    this._strategies.set('batch', () => new InboxBatchStrategy());
  }

  create(name: string): IInboxStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error('Unknown inbox strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', '));
    }
    return factory();
  }

  createDefault(): IInboxStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => IInboxStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): IInboxStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): IInboxStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
