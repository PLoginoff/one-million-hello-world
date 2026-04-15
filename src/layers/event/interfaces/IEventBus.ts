/**
 * Event Bus Interface
 * 
 * Defines the contract for event operations
 * including event bus, Pub/Sub, and domain event propagation.
 */

import {
  EventHandler,
  EventSubscription,
  EventConfig,
  EventStats,
} from '../types/event-types';

/**
 * Interface for event bus operations
 */
export interface IEventBus {
  /**
   * Subscribes to an event
   * 
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Subscription ID
   */
  subscribe<T>(event: string, handler: EventHandler<T>): string;

  /**
   * Subscribes to an event once
   * 
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Subscription ID
   */
  once<T>(event: string, handler: EventHandler<T>): string;

  /**
   * Unsubscribes from an event
   * 
   * @param subscriptionId - Subscription ID
   */
  unsubscribe(subscriptionId: string): void;

  /**
   * Publishes an event
   * 
   * @param event - Event name
   * @param data - Event data
   */
  publish<T>(event: string, data: T): void;

  /**
   * Publishes an event asynchronously
   * 
   * @param event - Event name
   * @param data - Event data
   */
  publishAsync<T>(event: string, data: T): Promise<void>;

  /**
   * Gets event statistics
   * 
   * @returns Event statistics
   */
  getStats(): EventStats;

  /**
   * Sets event bus configuration
   * 
   * @param config - Event configuration
   */
  setConfig(config: EventConfig): void;

  /**
   * Gets current event bus configuration
   * 
   * @returns Current event configuration
   */
  getConfig(): EventConfig;

  /**
   * Clears all subscriptions
   */
  clear(): void;
}
