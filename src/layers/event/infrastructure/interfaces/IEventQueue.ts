/**
 * IEventQueue - Infrastructure Interface
 * 
 * Interface for event queue management.
 * Provides buffered event processing with queue semantics.
 */

import { Event } from '../../domain/entities/Event';

export interface QueueStats {
  size: number;
  processed: number;
  failed: number;
  avgProcessingTime: number;
}

export interface IEventQueue {
  enqueue(event: Event): Promise<void>;
  enqueueBatch(events: Event[]): Promise<void>;
  dequeue(): Promise<Event | undefined>;
  peek(): Promise<Event | undefined>;
  size(): Promise<number>;
  isEmpty(): Promise<boolean>;
  clear(): Promise<void>;
  getStats(): QueueStats;
  startProcessing(): Promise<void>;
  stopProcessing(): Promise<void>;
  isProcessing(): boolean;
}
