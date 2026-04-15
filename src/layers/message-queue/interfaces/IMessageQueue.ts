/**
 * Message Queue Interface
 * 
 * Defines the contract for message queue operations
 * including async processing and dead letter queues.
 */

import { Message, QueueStats, QueueConfig, QueueResult } from '../types/message-queue-types';

/**
 * Message handler function type
 */
export type MessageHandler<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Interface for message queue operations
 */
export interface IMessageQueue {
  /**
   * Enqueues a message
   * 
   * @param data - Message data
   * @param priority - Message priority (higher = more important)
   * @returns Queue result
   */
  enqueue<T>(data: T, priority?: number): QueueResult;

  /**
   * Dequeues and processes a message
   * 
   * @param handler - Message handler function
   * @returns Promise that resolves when message is processed
   */
  dequeue<T>(handler: MessageHandler<T>): Promise<void>;

  /**
   * Registers a handler for automatic processing
   * 
   * @param handler - Message handler function
   */
  registerHandler<T>(handler: MessageHandler<T>): void;

  /**
   * Starts automatic processing
   */
  start(): void;

  /**
   * Stops automatic processing
   */
  stop(): void;

  /**
   * Gets queue statistics
   * 
   * @returns Queue statistics
   */
  getStats(): QueueStats;

  /**
   * Sets queue configuration
   * 
   * @param config - Queue configuration
   */
  setConfig(config: QueueConfig): void;

  /**
   * Gets current queue configuration
   * 
   * @returns Current queue configuration
   */
  getConfig(): QueueConfig;

  /**
   * Clears the queue
   */
  clear(): void;

  /**
   * Gets dead letter queue messages
   * 
   * @returns Array of dead letter messages
   */
  getDeadLetterQueue<T>(): Message<T>[];
}
