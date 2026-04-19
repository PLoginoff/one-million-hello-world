/**
 * IEventPublisher - Infrastructure Interface
 * 
 * Interface for publishing events to external systems.
 * Supports multiple publishing strategies and backends.
 */

import { Event } from '../../domain/entities/Event';

export type PublishResult = {
  success: boolean;
  eventId: string;
  publishedAt: Date;
  error?: Error;
};

export interface IEventPublisher {
  publish(event: Event): Promise<PublishResult>;
  publishBatch(events: Event[]): Promise<PublishResult[]>;
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
