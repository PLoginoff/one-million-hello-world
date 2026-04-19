/**
 * IEventSubscriber - Infrastructure Interface
 * 
 * Interface for subscribing to events from external systems.
 * Supports multiple subscription strategies and backends.
 */

import { Event } from '../../domain/entities/Event';

export type SubscriptionCallback = (event: Event) => void | Promise<void>;

export interface IEventSubscriber {
  subscribe(eventType: string, callback: SubscriptionCallback): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
}
