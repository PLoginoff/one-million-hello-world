/**
 * SubscriptionManager - Core Implementation
 * 
 * Manages event subscriptions with lifecycle tracking.
 * Provides storage, retrieval, and statistics for subscriptions.
 */

import { ISubscriptionManager, Subscription, EventHandler } from '../interfaces';

export class SubscriptionManager implements ISubscriptionManager {
  private _subscriptions: Map<string, Subscription>;
  private _eventTypeIndex: Map<string, Set<string>>;

  constructor() {
    this._subscriptions = new Map();
    this._eventTypeIndex = new Map();
  }

  add(eventType: string, handler: EventHandler, once: boolean): Subscription {
    const id = this._generateId();
    const subscription: Subscription = {
      id,
      eventType,
      handler,
      once,
      createdAt: new Date(),
      executionCount: 0,
    };

    this._subscriptions.set(id, subscription);

    if (!this._eventTypeIndex.has(eventType)) {
      this._eventTypeIndex.set(eventType, new Set());
    }
    this._eventTypeIndex.get(eventType)!.add(id);

    return subscription;
  }

  remove(subscriptionId: string): boolean {
    const subscription = this._subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    const eventTypeSet = this._eventTypeIndex.get(subscription.eventType);
    if (eventTypeSet) {
      eventTypeSet.delete(subscriptionId);
      if (eventTypeSet.size === 0) {
        this._eventTypeIndex.delete(subscription.eventType);
      }
    }

    return this._subscriptions.delete(subscriptionId);
  }

  get(subscriptionId: string): Subscription | undefined {
    const subscription = this._subscriptions.get(subscriptionId);
    if (!subscription) {
      return undefined;
    }
    return this._cloneSubscription(subscription);
  }

  getByEventType(eventType: string): Subscription[] {
    const ids = this._eventTypeIndex.get(eventType);
    if (!ids) {
      return [];
    }

    const subscriptions: Subscription[] = [];
    for (const id of ids) {
      const subscription = this._subscriptions.get(id);
      if (subscription) {
        subscriptions.push(this._cloneSubscription(subscription));
      }
    }

    return subscriptions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getAll(): Subscription[] {
    const subscriptions: Subscription[] = [];
    for (const subscription of this._subscriptions.values()) {
      subscriptions.push(this._cloneSubscription(subscription));
    }
    return subscriptions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  clear(): void {
    this._subscriptions.clear();
    this._eventTypeIndex.clear();
  }

  count(): number {
    return this._subscriptions.size;
  }

  countByEventType(eventType: string): number {
    const ids = this._eventTypeIndex.get(eventType);
    return ids ? ids.size : 0;
  }

  updateExecution(subscriptionId: string): void {
    const subscription = this._subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.executionCount++;
      subscription.lastExecutedAt = new Date();
    }
  }

  private _generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `sub_${timestamp}_${random}`;
  }

  private _cloneSubscription(subscription: Subscription): Subscription {
    return {
      id: subscription.id,
      eventType: subscription.eventType,
      handler: subscription.handler,
      once: subscription.once,
      createdAt: new Date(subscription.createdAt),
      lastExecutedAt: subscription.lastExecutedAt 
        ? new Date(subscription.lastExecutedAt) 
        : undefined,
      executionCount: subscription.executionCount,
    };
  }
}
