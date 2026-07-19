/**
 * Event Store
 *
 * Stores and retrieves saga events for event sourcing.
 * Provides append-only storage with versioning.
 */

import { SagaEvent } from './SagaEvent';

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

  append(event: SagaEvent): Promise<void> {
    const events = this._storage.get(event.getExecutionId()) ?? [];
    events.push(event);
    this._storage.set(event.getExecutionId(), events);
    return Promise.resolve();
  }

  getEvents(executionId: string): Promise<SagaEvent[]> {
    const events = this._storage.get(executionId) ?? [];
    return Promise.resolve([...events]);
  }

  getEventsFromVersion(executionId: string, version: number): Promise<SagaEvent[]> {
    const events = this._storage.get(executionId) ?? [];
    return Promise.resolve(events.filter((e) => e.getVersion() >= version));
  }

  getLastEvent(executionId: string): Promise<SagaEvent | null> {
    const events = this._storage.get(executionId) ?? [];
    if (events.length === 0) {
      return Promise.resolve(null);
    }
    return Promise.resolve(events[events.length - 1] ?? null);
  }

  getEventsByType(executionId: string, eventType: string): Promise<SagaEvent[]> {
    const events = this._storage.get(executionId) ?? [];
    return Promise.resolve(events.filter((e) => e.getEventType() === eventType));
  }

  deleteEvents(executionId: string): Promise<void> {
    this._storage.delete(executionId);
    return Promise.resolve();
  }

  count(executionId: string): Promise<number> {
    const events = this._storage.get(executionId) ?? [];
    return Promise.resolve(events.length);
  }

  clear(): void {
    this._storage.clear();
  }
}
