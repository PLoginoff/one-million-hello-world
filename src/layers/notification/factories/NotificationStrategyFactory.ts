/**
 * NotificationStrategyFactory
 *
 * Factory for creating Notification strategies by name.
 */

import { NotificationDefaultStrategy } from '../strategies/DefaultStrategy';
import { NotificationFastStrategy } from '../strategies/FastStrategy';
import { NotificationReliableStrategy } from '../strategies/ReliableStrategy';
import { NotificationCachedStrategy } from '../strategies/CachedStrategy';
import { NotificationBatchStrategy } from '../strategies/BatchStrategy';

export interface INotificationStrategy {
  readonly name: string;
  readonly priority: number;
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  canHandle(input: unknown): boolean;
}

export class NotificationStrategyFactory {
  private _strategies: Map<string, () => INotificationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._strategies.set('default', () => new NotificationDefaultStrategy());
    this._strategies.set('fast', () => new NotificationFastStrategy());
    this._strategies.set('reliable', () => new NotificationReliableStrategy());
    this._strategies.set('cached', () => new NotificationCachedStrategy());
    this._strategies.set('batch', () => new NotificationBatchStrategy());
  }

  create(name: string): INotificationStrategy {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(
        'Unknown notification strategy: ' + name + '. Available: ' + this.getAvailableStrategies().join(', ')
      );
    }
    return factory();
  }

  createDefault(): INotificationStrategy {
    return this.create('default');
  }

  registerStrategy(name: string, factory: () => INotificationStrategy): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  createAll(): INotificationStrategy[] {
    return Array.from(this._strategies.values()).map(function (f) {
      return f();
    });
  }

  createByPriority(): INotificationStrategy[] {
    return this.createAll().sort(function (a, b) {
      return b.priority - a.priority;
    });
  }
}
