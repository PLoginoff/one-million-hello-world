/**
 * MemoryEventStore - Infrastructure Implementation
 * 
 * In-memory event store implementation.
 * Suitable for testing and single-instance deployments.
 */

import { IEventStore, EventStoreOptions } from '../interfaces';
import { Event } from '../../domain/entities/Event';

export class MemoryEventStore implements IEventStore {
  private _events: Map<string, Event>;
  private _typeIndex: Map<string, Set<string>>;
  private _correlationIndex: Map<string, Set<string>>;
  private _options: EventStoreOptions;

  constructor(options: EventStoreOptions = {}) {
    this._events = new Map();
    this._typeIndex = new Map();
    this._correlationIndex = new Map();
    this._options = {
      maxSize: options.maxSize || 10000,
      ttl: options.ttl,
    };
  }

  async save(event: Event): Promise<void> {
    await this._ensureCapacity();
    
    this._events.set(event.id.value, event);
    this._updateTypeIndex(event);
    this._updateCorrelationIndex(event);
  }

  async saveBatch(events: Event[]): Promise<void> {
    for (const event of events) {
      await this.save(event);
    }
  }

  async get(eventId: string): Promise<Event | undefined> {
    return this._events.get(eventId);
  }

  async getByType(eventType: string): Promise<Event[]> {
    const ids = this._typeIndex.get(eventType);
    if (!ids) {
      return [];
    }

    const events: Event[] = [];
    for (const id of ids) {
      const event = this._events.get(id);
      if (event) {
        events.push(event);
      }
    }

    return events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  async getByCorrelationId(correlationId: string): Promise<Event[]> {
    const ids = this._correlationIndex.get(correlationId);
    if (!ids) {
      return [];
    }

    const events: Event[] = [];
    for (const id of ids) {
      const event = this._events.get(id);
      if (event) {
        events.push(event);
      }
    }

    return events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  async getAll(limit?: number, offset?: number): Promise<Event[]> {
    const events = Array.from(this._events.values())
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    if (offset) {
      events.splice(0, offset);
    }

    if (limit) {
      return events.slice(0, limit);
    }

    return events;
  }

  async count(): Promise<number> {
    return this._events.size;
  }

  async countByType(eventType: string): Promise<number> {
    const ids = this._typeIndex.get(eventType);
    return ids ? ids.size : 0;
  }

  async clear(): Promise<void> {
    this._events.clear();
    this._typeIndex.clear();
    this._correlationIndex.clear();
  }

  async exists(eventId: string): Promise<boolean> {
    return this._events.has(eventId);
  }

  private async _ensureCapacity(): Promise<void> {
    if (this._options.maxSize && this._events.size >= this._options.maxSize) {
      const oldestEvent = Array.from(this._events.values())
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0];
      
      if (oldestEvent) {
        this._events.delete(oldestEvent.id.value);
        this._removeFromIndexes(oldestEvent);
      }
    }
  }

  private _updateTypeIndex(event: Event): void {
    const eventType = event.type.value;
    if (!this._typeIndex.has(eventType)) {
      this._typeIndex.set(eventType, new Set());
    }
    this._typeIndex.get(eventType)!.add(event.id.value);
  }

  private _updateCorrelationIndex(event: Event): void {
    const correlationId = event.metadata.correlationId;
    if (!this._correlationIndex.has(correlationId)) {
      this._correlationIndex.set(correlationId, new Set());
    }
    this._correlationIndex.get(correlationId)!.add(event.id.value);
  }

  private _removeFromIndexes(event: Event): void {
    const eventType = event.type.value;
    const typeSet = this._typeIndex.get(eventType);
    if (typeSet) {
      typeSet.delete(event.id.value);
      if (typeSet.size === 0) {
        this._typeIndex.delete(eventType);
      }
    }

    const correlationId = event.metadata.correlationId;
    const correlationSet = this._correlationIndex.get(correlationId);
    if (correlationSet) {
      correlationSet.delete(event.id.value);
      if (correlationSet.size === 0) {
        this._correlationIndex.delete(correlationId);
      }
    }
  }
}
