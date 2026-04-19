/**
 * IEventBus - Core Interface
 * 
 * Main interface for event bus operations.
 * Defines the contract for publishing, subscribing, and managing events.
 */

import { Event } from '../../domain/entities/Event';

export type EventHandler<T = unknown> = (event: Event<T>) => void | Promise<void>;

export interface IEventBus {
  subscribe<T>(eventType: string, handler: EventHandler<T>): string;
  once<T>(eventType: string, handler: EventHandler<T>): string;
  unsubscribe(subscriptionId: string): void;
  publish<T>(event: Event<T>): void;
  publishAsync<T>(event: Event<T>): Promise<void>;
  clear(): void;
  getSubscriptionCount(): number;
}
