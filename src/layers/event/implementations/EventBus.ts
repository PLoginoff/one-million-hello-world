/**
 * Event Bus Implementation
 * 
 * Concrete implementation of IEventBus.
 * Handles event bus, Pub/Sub, and domain event propagation.
 */

import { IEventBus } from '../interfaces/IEventBus';
import {
  EventHandler,
  EventSubscription,
  EventConfig,
  EventStats,
} from '../types/event-types';

export class EventBus implements IEventBus {
  private _subscriptions: Map<string, EventSubscription[]>;
  private _config: EventConfig;
  private _stats: EventStats;

  constructor() {
    this._subscriptions = new Map();
    this._config = {
      enableAsync: true,
      enablePersistence: false,
      maxQueueSize: 1000,
    };
    this._stats = {
      publishedCount: 0,
      handledCount: 0,
      errorCount: 0,
      subscriptionCount: 0,
    };
  }

  subscribe<T>(event: string, handler: EventHandler<T>): string {
    const subscriptionId = this._generateId();
    const subscription: EventSubscription<T> = {
      id: subscriptionId,
      event,
      handler,
      once: false,
    };

    const eventSubs = this._subscriptions.get(event) || [];
    eventSubs.push(subscription as EventSubscription);
    this._subscriptions.set(event, eventSubs);

    this._stats.subscriptionCount++;
    return subscriptionId;
  }

  once<T>(event: string, handler: EventHandler<T>): string {
    const subscriptionId = this._generateId();
    const subscription: EventSubscription<T> = {
      id: subscriptionId,
      event,
      handler,
      once: true,
    };

    const eventSubs = this._subscriptions.get(event) || [];
    eventSubs.push(subscription as EventSubscription);
    this._subscriptions.set(event, eventSubs);

    this._stats.subscriptionCount++;
    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): void {
    for (const [event, subs] of this._subscriptions.entries()) {
      const index = subs.findIndex((sub) => sub.id === subscriptionId);
      if (index !== -1) {
        subs.splice(index, 1);
        this._stats.subscriptionCount--;
        if (subs.length === 0) {
          this._subscriptions.delete(event);
        }
        break;
      }
    }
  }

  publish<T>(event: string, data: T): void {
    this._stats.publishedCount++;
    const subs = this._subscriptions.get(event) || [];

    const toRemove: number[] = [];
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      if (!sub) continue;
      try {
        sub.handler(data);
        this._stats.handledCount++;
        if (sub.once) {
          toRemove.push(i);
        }
      } catch (error) {
        this._stats.errorCount++;
      }
    }

    for (const index of toRemove.reverse()) {
      subs.splice(index, 1);
      this._stats.subscriptionCount--;
    }
  }

  async publishAsync<T>(event: string, data: T): Promise<void> {
    if (!this._config.enableAsync) {
      this.publish(event, data);
      return;
    }

    this._stats.publishedCount++;
    const subs = this._subscriptions.get(event) || [];

    const toRemove: number[] = [];
    const promises = [];

    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      if (!sub) continue;
      const promise = Promise.resolve().then(async () => {
        try {
          await sub.handler(data);
          this._stats.handledCount++;
          if (sub.once) {
            toRemove.push(i);
          }
        } catch (error) {
          this._stats.errorCount++;
        }
      });
      promises.push(promise);
    }

    await Promise.all(promises);

    for (const index of toRemove.reverse()) {
      subs.splice(index, 1);
      this._stats.subscriptionCount--;
    }
  }

  getStats(): EventStats {
    return { ...this._stats };
  }

  setConfig(config: EventConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): EventConfig {
    return { ...this._config };
  }

  clear(): void {
    this._subscriptions.clear();
    this._stats.subscriptionCount = 0;
  }

  private _generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
