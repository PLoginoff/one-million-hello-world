/**
 * ISubscriptionManager - Core Interface
 *
 * Interface for managing event subscriptions.
 * Handles subscription lifecycle, storage, and retrieval.
 */

import { EventHandler } from './IEventBus';

export interface Subscription {
  id: string;
  eventType: string;
  handler: EventHandler<unknown>;
  once: boolean;
  createdAt: Date;
  lastExecutedAt?: Date;
  executionCount: number;
}

export interface ISubscriptionManager {
  add<T>(eventType: string, handler: EventHandler<T>, once: boolean): Subscription;
  remove(subscriptionId: string): boolean;
  get(subscriptionId: string): Subscription | undefined;
  getByEventType(eventType: string): Subscription[];
  getAll(): Subscription[];
  clear(): void;
  count(): number;
  countByEventType(eventType: string): number;
  updateExecution(subscriptionId: string): void;
}
