/**
 * Redis Event Bus Adapter
 *
 * Mock Redis-backed event bus for testing (simulates Redis Pub/Sub).
 */

import { IEventBus } from '../interfaces/IEventBus';
import { EventHandler, EventConfig, EventStats } from '../types/event-types';

interface Subscription {
  id: string;
  event: string;
  handler: EventHandler<unknown>;
  once: boolean;
}

export class RedisEventBusAdapter implements IEventBus {
  private _subscriptions: Map<string, Subscription>;
  private _config: EventConfig;
  private _stats: EventStats;
  private _redisUrl: string;

  constructor(redisUrl: string = 'redis://localhost:6379') {
    this._subscriptions = new Map();
    this._config = { enableAsync: true, enablePersistence: true, maxQueueSize: 10000 };
    this._stats = { publishedCount: 0, handledCount: 0, errorCount: 0, subscriptionCount: 0 };
    this._redisUrl = redisUrl;
  }

  subscribe<T>(event: string, handler: EventHandler<T>): string {
    const id = `redis-sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this._subscriptions.set(id, { id, event, handler: handler as EventHandler<unknown>, once: false });
    this._stats.subscriptionCount = this._subscriptions.size;
    return id;
  }

  once<T>(event: string, handler: EventHandler<T>): string {
    const id = `redis-sub-once-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this._subscriptions.set(id, { id, event, handler: handler as EventHandler<unknown>, once: true });
    this._stats.subscriptionCount = this._subscriptions.size;
    return id;
  }

  unsubscribe(subscriptionId: string): void {
    this._subscriptions.delete(subscriptionId);
    this._stats.subscriptionCount = this._subscriptions.size;
  }

  publish<T>(event: string, data: T): void {
    this._stats.publishedCount++;
    for (const [id, sub] of this._subscriptions) {
      if (sub.event === event) {
        try {
          void sub.handler(data);
          this._stats.handledCount++;
        } catch {
          this._stats.errorCount++;
        }
        if (sub.once) {
          this._subscriptions.delete(id);
          this._stats.subscriptionCount = this._subscriptions.size;
        }
      }
    }
  }

  async publishAsync<T>(event: string, data: T): Promise<void> {
    this._stats.publishedCount++;
    const matching = Array.from(this._subscriptions.values()).filter((s) => s.event === event);
    for (const sub of matching) {
      try {
        await Promise.resolve(sub.handler(data));
        this._stats.handledCount++;
      } catch {
        this._stats.errorCount++;
      }
      if (sub.once) {
        this._subscriptions.delete(sub.id);
        this._stats.subscriptionCount = this._subscriptions.size;
      }
    }
  }

  getStats(): EventStats {
    return { ...this._stats };
  }

  setConfig(config: EventConfig): void {
    this._config = { ...config };
  }

  getConfig(): EventConfig {
    return { ...this._config };
  }

  clear(): void {
    this._subscriptions.clear();
    this._stats.subscriptionCount = 0;
  }

  getRedisUrl(): string {
    return this._redisUrl;
  }
}
