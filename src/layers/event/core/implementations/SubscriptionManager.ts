/**
 * Subscription Manager Implementation
 *
 * Manages event subscriptions with indexing by event type.
 */

import { EventHandler } from '../interfaces/IEventBus';
import { ISubscriptionManager, Subscription } from '../interfaces/ISubscriptionManager';

export class SubscriptionManager implements ISubscriptionManager {
  private subscriptions: Map<string, Subscription>;
  private index: Map<string, Set<string>>;
  private counter: number;

  constructor() {
    this.subscriptions = new Map();
    this.index = new Map();
    this.counter = 0;
  }

  add<T>(eventType: string, handler: EventHandler<T>, once: boolean): Subscription {
    const id = `sub_${++this.counter}_${Date.now()}`;
    const subscription: Subscription = {
      id,
      eventType,
      handler: handler as EventHandler<unknown>,
      once,
      createdAt: new Date(),
      executionCount: 0,
    };

    this.subscriptions.set(id, subscription);

    if (!this.index.has(eventType)) {
      this.index.set(eventType, new Set());
    }
    this.index.get(eventType)!.add(id);

    return this.clone(subscription);
  }

  remove(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    this.subscriptions.delete(subscriptionId);

    const eventTypeIds = this.index.get(subscription.eventType);
    if (eventTypeIds) {
      eventTypeIds.delete(subscriptionId);
      if (eventTypeIds.size === 0) {
        this.index.delete(subscription.eventType);
      }
    }

    return true;
  }

  get(subscriptionId: string): Subscription | undefined {
    const subscription = this.subscriptions.get(subscriptionId);
    return subscription ? this.clone(subscription) : undefined;
  }

  getByEventType(eventType: string): Subscription[] {
    const ids = this.index.get(eventType);
    if (!ids) {
      return [];
    }

    return Array.from(ids)
      .map((id) => this.subscriptions.get(id))
      .filter((sub): sub is Subscription => sub !== undefined)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((sub) => this.clone(sub));
  }

  getAll(): Subscription[] {
    return Array.from(this.subscriptions.values())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((sub) => this.clone(sub));
  }

  clear(): void {
    this.subscriptions.clear();
    this.index.clear();
  }

  count(): number {
    return this.subscriptions.size;
  }

  countByEventType(eventType: string): number {
    const ids = this.index.get(eventType);
    return ids ? ids.size : 0;
  }

  countByType(eventType: string): number {
    return this.countByEventType(eventType);
  }

  updateExecution(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    subscription.executionCount++;
    subscription.lastExecutedAt = new Date();
  }

  private clone(subscription: Subscription): Subscription {
    return {
      ...subscription,
      createdAt: new Date(subscription.createdAt.getTime()),
      lastExecutedAt: subscription.lastExecutedAt ? new Date(subscription.lastExecutedAt.getTime()) : undefined,
    };
  }
}
