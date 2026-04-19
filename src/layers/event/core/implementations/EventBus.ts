/**
 * EventBus - Core Implementation
 * 
 * Main event bus implementation with subscription management,
 * async publishing, and error handling.
 */

import { IEventBus, EventHandler } from '../interfaces';
import { ISubscriptionManager } from '../interfaces';
import { IErrorHandler } from '../interfaces';
import { IEventExecutor } from '../interfaces';
import { Event } from '../../domain/entities/Event';
import { SubscriptionManager } from './SubscriptionManager';
import { ErrorHandler } from './ErrorHandler';
import { EventExecutor } from './EventExecutor';

export interface EventBusOptions {
  subscriptionManager?: ISubscriptionManager;
  errorHandler?: IErrorHandler;
  executor?: IEventExecutor;
}

export class EventBus implements IEventBus {
  private _subscriptionManager: ISubscriptionManager;
  private _errorHandler: IErrorHandler;
  private _executor: IEventExecutor;

  constructor(options: EventBusOptions = {}) {
    this._subscriptionManager = options.subscriptionManager || new SubscriptionManager();
    this._errorHandler = options.errorHandler || new ErrorHandler();
    this._executor = options.executor || new EventExecutor(this._errorHandler);
  }

  subscribe<T>(eventType: string, handler: EventHandler<T>): string {
    const subscription = this._subscriptionManager.add(eventType, handler, false);
    return subscription.id;
  }

  once<T>(eventType: string, handler: EventHandler<T>): string {
    const subscription = this._subscriptionManager.add(eventType, handler, true);
    return subscription.id;
  }

  unsubscribe(subscriptionId: string): void {
    this._subscriptionManager.remove(subscriptionId);
  }

  publish<T>(event: Event<T>): void {
    const subscriptions = this._subscriptionManager.getByEventType(event.type.value);
    const toRemove: string[] = [];

    for (const subscription of subscriptions) {
      const result = this._executor.execute(event, subscription.handler);
      
      if (result.success) {
        this._subscriptionManager.updateExecution(subscription.id);
        
        if (subscription.once) {
          toRemove.push(subscription.id);
        }
      }
    }

    for (const id of toRemove) {
      this.unsubscribe(id);
    }
  }

  async publishAsync<T>(event: Event<T>): Promise<void> {
    const subscriptions = this._subscriptionManager.getByEventType(event.type.value);
    const toRemove: string[] = [];

    const results = await this._executor.executeBatchAsync(event, subscriptions.map(s => s.handler));

    for (let i = 0; i < subscriptions.length; i++) {
      const subscription = subscriptions[i];
      const result = results[i];
      
      if (result.success) {
        this._subscriptionManager.updateExecution(subscription.id);
        
        if (subscription.once) {
          toRemove.push(subscription.id);
        }
      }
    }

    for (const id of toRemove) {
      this.unsubscribe(id);
    }
  }

  clear(): void {
    this._subscriptionManager.clear();
  }

  getSubscriptionCount(): number {
    return this._subscriptionManager.count();
  }

  getSubscriptionManager(): ISubscriptionManager {
    return this._subscriptionManager;
  }

  getErrorHandler(): IErrorHandler {
    return this._errorHandler;
  }

  getExecutor(): IEventExecutor {
    return this._executor;
  }
}
