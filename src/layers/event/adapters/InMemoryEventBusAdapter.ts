/**
 * In-Memory Event Bus Adapter
 *
 * High-performance in-memory event bus for testing and development.
 * Supports synchronous and asynchronous event delivery with full Pub/Sub semantics.
 *
 * @module EventLayer/Adapters
 */

import { IEventBus } from '../interfaces/IEventBus';
import { EventHandler, EventConfig, EventStats } from '../types/event-types';

interface Subscription<T = unknown> {
  id: string;
  event: string;
  handler: EventHandler<T>;
  once: boolean;
  createdAt: number;
  filter?: (payload: T) => boolean;
}

/**
 * Configuration for InMemoryEventBusAdapter.
 */
export interface InMemoryEventBusAdapterConfig {
  /** Enable asynchronous event delivery */
  enableAsync: boolean;
  /** Enable event persistence (store events for replay) */
  enablePersistence: boolean;
  /** Maximum number of events to store for replay */
  maxEventHistory: number;
  /** Maximum number of subscriptions */
  maxSubscriptions: number;
  /** Default timeout for async operations (ms) */
  defaultTimeoutMs: number;
}

/**
 * Default configuration.
 */
export const DEFAULT_IN_MEMORY_CONFIG: InMemoryEventBusAdapterConfig = {
  enableAsync: true,
  enablePersistence: false,
  maxEventHistory: 1000,
  maxSubscriptions: 10000,
  defaultTimeoutMs: 5000,
};

/**
 * In-Memory Event Bus Adapter implementation.
 * Provides a full-featured event bus with Pub/Sub, persistence, and replay capabilities.
 */
export class InMemoryEventBusAdapter implements IEventBus {
  private readonly _subscriptions: Map<string, Subscription<unknown>[]>;
  private readonly _config: InMemoryEventBusAdapterConfig;
  private readonly _stats: EventStats;
  private readonly _eventHistory: Array<{ event: string; data: unknown; timestamp: number }>;
  private readonly _wildcardSubscriptions: Subscription<unknown>[];
  private _disposed: boolean;

  /**
   * Creates a new InMemoryEventBusAdapter.
   *
   * @param config - Optional configuration
   */
  constructor(config: Partial<InMemoryEventBusAdapterConfig> = {}) {
    this._config = { ...DEFAULT_IN_MEMORY_CONFIG, ...config };
    this._subscriptions = new Map();
    this._wildcardSubscriptions = [];
    this._stats = {
      publishedCount: 0,
      handledCount: 0,
      errorCount: 0,
      subscriptionCount: 0,
    };
    this._eventHistory = [];
    this._disposed = false;
  }

  /**
   * @inheritdoc
   */
  subscribe<T>(event: string, handler: EventHandler<T>, filter?: (payload: T) => boolean): string {
    this._checkDisposed();

    if (this._stats.subscriptionCount >= this._config.maxSubscriptions) {
      throw new Error(`Maximum subscriptions (${this._config.maxSubscriptions}) reached`);
    }

    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const subscription: Subscription<T> = {
      id,
      event,
      handler: handler as EventHandler<unknown>,
      once: false,
      createdAt: Date.now(),
      filter: filter as ((payload: unknown) => boolean) | undefined,
    };

    if (event === '*' || event === '**') {
      this._wildcardSubscriptions.push(subscription as Subscription<unknown>);
    } else {
      const subs = this._subscriptions.get(event) ?? [];
      subs.push(subscription as Subscription<unknown>);
      this._subscriptions.set(event, subs);
    }

    this._stats.subscriptionCount++;
    return id;
  }

  /**
   * @inheritdoc
   */
  once<T>(event: string, handler: EventHandler<T>, filter?: (payload: T) => boolean): string {
    this._checkDisposed();

    if (this._stats.subscriptionCount >= this._config.maxSubscriptions) {
      throw new Error(`Maximum subscriptions (${this._config.maxSubscriptions}) reached`);
    }

    const id = `sub_once_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const subscription: Subscription<T> = {
      id,
      event,
      handler: handler as EventHandler<unknown>,
      once: true,
      createdAt: Date.now(),
      filter: filter as ((payload: unknown) => boolean) | undefined,
    };

    if (event === '*' || event === '**') {
      this._wildcardSubscriptions.push(subscription as Subscription<unknown>);
    } else {
      const subs = this._subscriptions.get(event) ?? [];
      subs.push(subscription as Subscription<unknown>);
      this._subscriptions.set(event, subs);
    }

    this._stats.subscriptionCount++;
    return id;
  }

  /**
   * @inheritdoc
   */
  unsubscribe(subscriptionId: string): void {
    this._checkDisposed();

    // Check regular subscriptions
    for (const [event, subs] of this._subscriptions.entries()) {
      const index = subs.findIndex((s) => s.id === subscriptionId);
      if (index !== -1) {
        subs.splice(index, 1);
        this._stats.subscriptionCount--;
        if (subs.length === 0) {
          this._subscriptions.delete(event);
        }
        return;
      }
    }

    // Check wildcard subscriptions
    const wildcardIndex = this._wildcardSubscriptions.findIndex((s) => s.id === subscriptionId);
    if (wildcardIndex !== -1) {
      this._wildcardSubscriptions.splice(wildcardIndex, 1);
      this._stats.subscriptionCount--;
    }
  }

  /**
   * @inheritdoc
   */
  publish<T>(event: string, data: T): void {
    this._checkDisposed();
    this._publishInternal(event, data, false);
  }

  /**
   * @inheritdoc
   */
  async publishAsync<T>(event: string, data: T): Promise<void> {
    this._checkDisposed();
    await this._publishInternal(event, data, true);
  }

  /**
   * Internal publish implementation.
   */
  private async _publishInternal<T>(event: string, data: T, async: boolean): Promise<void> {
    this._stats.publishedCount++;

    // Store in history if persistence enabled
    if (this._config.enablePersistence) {
      this._eventHistory.push({ event, data, timestamp: Date.now() });
      if (this._eventHistory.length > this._config.maxEventHistory) {
        this._eventHistory.shift();
      }
    }

    const subscriptions = this._getMatchingSubscriptions(event);
    if (subscriptions.length === 0) return;

    if (async) {
      // Async: call all handlers in parallel
      await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            // Check filter if present
            if (sub.filter && !sub.filter(data)) {
              return;
            }
            await sub.handler(data);
            this._stats.handledCount++;
          } catch {
            this._stats.errorCount++;
          }
          if (sub.once) {
            this.unsubscribe(sub.id);
          }
        })
      );
    } else {
      // Sync: call handlers directly
      for (const sub of subscriptions) {
        try {
          // Check filter if present
          if (sub.filter && !sub.filter(data)) {
            continue;
          }
          const result = sub.handler(data);
          if (result instanceof Promise) {
            await result;
          }
          this._stats.handledCount++;
        } catch {
          this._stats.errorCount++;
        }
        if (sub.once) {
          this.unsubscribe(sub.id);
        }
      }
    }
  }

  /**
   * Gets all subscriptions matching an event (including wildcards).
   */
  private _getMatchingSubscriptions(event: string): Subscription<unknown>[] {
    const exact = this._subscriptions.get(event) ?? [];
    return [...exact, ...this._wildcardSubscriptions];
  }

  /**
   * @inheritdoc
   */
  getStats(): EventStats {
    return { ...this._stats };
  }

  /**
   * @inheritdoc
   */
  setConfig(config: EventConfig): void {
    this._checkDisposed();
    // Merge with existing config
    Object.assign(this._config, config);
  }

  /**
   * @inheritdoc
   */
  getConfig(): EventConfig {
    return {
      enableAsync: this._config.enableAsync,
      enablePersistence: this._config.enablePersistence,
      maxQueueSize: this._config.maxSubscriptions,
      maxSubscriptions: this._config.maxSubscriptions,
      timeout: this._config.defaultTimeoutMs,
      enableMetrics: true,
      enableLogging: true,
      logLevel: (this._config as any).logLevel ?? 'info',
      serializationFormat: 'json',
    };
  }

  /**
   * @inheritdoc
   */
  clear(): void {
    this._checkDisposed();
    this._subscriptions.clear();
    this._wildcardSubscriptions.length = 0;
    this._stats.subscriptionCount = 0;
  }

  /**
   * Gets the event history (if persistence enabled).
   *
   * @returns Array of historical events
   */
  getEventHistory(): Array<{ event: string; data: unknown; timestamp: number }> {
    return [...this._eventHistory];
  }

  /**
   * Replays events from history to a new subscriber.
   *
   * @param event - Event name to replay (or '*' for all)
   * @param handler - Handler to receive replayed events
   * @param since - Optional timestamp to replay events since
   * @returns Number of events replayed
   */
  replayEvents<T>(
    event: string,
    handler: EventHandler<T>,
    since?: number
  ): number {
    this._checkDisposed();

    if (!this._config.enablePersistence) {
      throw new Error('Event persistence is not enabled');
    }

    let count = 0;
    for (const historicalEvent of this._eventHistory) {
      if (event !== '*' && historicalEvent.event !== event) continue;
      if (since && historicalEvent.timestamp < since) continue;

      try {
        handler(historicalEvent.data as T);
        count++;
      } catch {
        this._stats.errorCount++;
      }
    }

    return count;
  }

  /**
   * Gets all active subscription IDs for an event.
   *
   * @param event - Event name
   * @returns Array of subscription IDs
   */
  getSubscriptionIds(event: string): string[] {
    const subs = this._subscriptions.get(event) ?? [];
    return subs.map((s) => s.id);
  }

  /**
   * Gets the number of subscribers for an event.
   *
   * @param event - Event name
   * @returns Number of subscribers
   */
  getSubscriberCount(event: string): number {
    return (this._subscriptions.get(event) ?? []).length + this._wildcardSubscriptions.length;
  }

  /**
   * Checks if the adapter has been disposed.
   *
   * @returns True if disposed
   */
  isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * Disposes the adapter and cleans up resources.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.clear();
    this._eventHistory.length = 0;
  }

  private _checkDisposed(): void {
    if (this._disposed) {
      throw new Error('InMemoryEventBusAdapter has been disposed');
    }
  }
}