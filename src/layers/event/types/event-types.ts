/**
 * Event Layer Types
 * 
 * This module defines all type definitions for the Event Layer,
 * including event bus, Pub/Sub, and domain event propagation.
 */

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/**
 * Event subscription
 */
export interface EventSubscription<T = unknown> {
  id: string;
  event: string;
  handler: EventHandler<T>;
  once: boolean;
}

/**
 * Event configuration
 */
export interface EventConfig {
  enableAsync: boolean;
  enablePersistence: boolean;
  maxQueueSize: number;
}

/**
 * Event statistics
 */
export interface EventStats {
  publishedCount: number;
  handledCount: number;
  errorCount: number;
  subscriptionCount: number;
}
