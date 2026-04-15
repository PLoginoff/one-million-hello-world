/**
 * Message Queue Layer Types
 * 
 * This module defines all type definitions for the Message Queue Layer,
 * including async processing and dead letter queues.
 */

/**
 * Message
 */
export interface Message<T = unknown> {
  id: string;
  data: T;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  scheduledAt: number;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  queuedCount: number;
  processedCount: number;
  failedCount: number;
  deadLetterCount: number;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  maxRetries: number;
  retryDelay: number;
  enableDeadLetter: boolean;
  maxQueueSize: number;
}

/**
 * Queue result
 */
export interface QueueResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
