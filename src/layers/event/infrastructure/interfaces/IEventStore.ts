/**
 * IEventStore - Infrastructure Interface
 * 
 * Interface for persisting and retrieving events.
 * Provides event sourcing capabilities and event history.
 */

import { Event } from '../../domain/entities/Event';

export interface EventStoreOptions {
  maxSize?: number;
  ttl?: number;
}

export interface IEventStore {
  save(event: Event): Promise<void>;
  saveBatch(events: Event[]): Promise<void>;
  get(eventId: string): Promise<Event | undefined>;
  getByType(eventType: string): Promise<Event[]>;
  getByCorrelationId(correlationId: string): Promise<Event[]>;
  getAll(limit?: number, offset?: number): Promise<Event[]>;
  count(): Promise<number>;
  countByType(eventType: string): Promise<number>;
  clear(): Promise<void>;
  exists(eventId: string): Promise<boolean>;
}
