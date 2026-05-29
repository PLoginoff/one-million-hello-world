/**
 * Event Store
 *
 * Stores and retrieves saga events for event sourcing.
 * Provides append-only storage with versioning.
 */

import { SagaEvent, SagaEventData } from './SagaEvent';

export interface EventStore {
  append(event: SagaEvent): Promise<void>;
  getEvents(executionId: string): Promise<SagaEvent[]>;
  getEventsFromVersion(executionId: string, version: number): Promise<SagaEvent[]>;
  getLastEvent(executionId: string): Promise<SagaEvent | null>;
  getEventsByType(executionId: string, eventType: string): Promise<SagaEvent[]>;
  deleteEvents(executionId: string): Promise<void>;
  count(executionId: string): Promise<number>;
}

export class InMemoryEventStore implements EventStore {
  private readonly _storage: Map<string, SagaEvent[]>;

  constructor() {
    this._storage = new Map();
  }

  async append(event: SagaEvent): Promise<void> {
    const events = this._storage.get(event.getExecutionId()) || [];
    events.push(event);
    this._storage.set(event.getExecutionId(), events);
  }

  async getEvents(executionId: string): Promise<SagaEvent[]> {
    const events = this._storage.get(executionId) || [];
    return [...events];
  }

  async getEventsFromVersion(executionId: string, version: number): Promise<SagaEvent[]> {
    const events = this._storage.get(executionId) || [];
    return events.filter(e => e.getVersion() >= version);
  }

  async getLastEvent(executionId: string): Promise<SagaEvent | null> {
    const events = this._storage.get(executionId) || [];
    if (events.length === 0) {
      return null;
    }
    return events[events.length - 1] || null;
  }

  async getEventsByType(executionId: string, eventType: string): Promise<SagaEvent[]> {
    const events = this._storage.get(executionId) || [];
    return events.filter(e => e.getEventType() === eventType);
  }

  async deleteEvents(executionId: string): Promise<void> {
    this._storage.delete(executionId);
  }

  async count(executionId: string): Promise<number> {
    const events = this._storage.get(executionId) || [];
    return events.length;
  }

  clear(): void {
    this._storage.clear();
  }
}
