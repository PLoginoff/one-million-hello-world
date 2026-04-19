/**
 * TestEventFactory - Testing Utility
 * 
 * Factory for creating test events with various configurations.
 * Provides convenient methods for generating test data.
 */

import { Event } from '../domain/entities/Event';
import { EventId } from '../domain/value-objects/EventId';
import { EventType } from '../domain/value-objects/EventType';
import { EventMetadata } from '../domain/value-objects/EventMetadata';
import { EventPayload } from '../domain/value-objects/EventPayload';

export class TestEventFactory {
  static createTestEvent<T>(type: string, payload: T): Event<T> {
    return Event.create(type, payload);
  }

  static createEventWithCustomId<T>(type: string, payload: T, id: string): Event<T> {
    return new Event({
      id: EventId.fromString(id),
      type,
      payload,
    });
  }

  static createEventWithMetadata<T>(
    type: string,
    payload: T,
    metadata: EventMetadata
  ): Event<T> {
    return new Event({
      type,
      payload,
      metadata,
    });
  }

  static createEventWithCorrelation<T>(
    type: string,
    payload: T,
    correlationId: string
  ): Event<T> {
    const metadata = new EventMetadata({
      source: 'test',
      correlationId,
    });
    return new Event({
      type,
      payload,
      metadata,
    });
  }

  static createEventInPast<T>(type: string, payload: T, minutesAgo: number): Event<T> {
    const occurredAt = new Date(Date.now() - minutesAgo * 60 * 1000);
    return new Event({
      type,
      payload,
      occurredAt,
    });
  }

  static createBatch<T>(type: string, payloads: T[]): Event<T>[] {
    return payloads.map(payload => Event.create(type, payload));
  }

  static createSequentialEvents<T>(type: string, payloads: T[]): Event<T>[] {
    const events: Event<T>[] = [];
    const baseTime = Date.now();

    payloads.forEach((payload, index) => {
      const event = new Event({
        type,
        payload,
        occurredAt: new Date(baseTime + index * 100),
      });
      events.push(event);
    });

    return events;
  }

  static createCorrelatedEvents<T>(type: string, payloads: T[]): Event<T>[] {
    const correlationId = `test-correlation-${Date.now()}`;
    return payloads.map(payload => {
      const metadata = new EventMetadata({
        source: 'test',
        correlationId,
      });
      return new Event({
        type,
        payload,
        metadata,
      });
    });
  }

  static createEventWithCausation<T>(
    type: string,
    payload: T,
    causationId: string,
    correlationId?: string
  ): Event<T> {
    const metadata = new EventMetadata({
      source: 'test',
      correlationId: correlationId || `test-correlation-${Date.now()}`,
      causationId,
    });
    return new Event({
      type,
      payload,
      metadata,
    });
  }

  static createEventWithTags<T>(
    type: string,
    payload: T,
    tags: Record<string, string>
  ): Event<T> {
    const metadata = new EventMetadata({
      source: 'test',
      tags,
    });
    return new Event({
      type,
      payload,
      metadata,
    });
  }

  static createEventWithUserId<T>(type: string, payload: T, userId: string): Event<T> {
    const metadata = new EventMetadata({
      source: 'test',
      userId,
    });
    return new Event({
      type,
      payload,
      metadata,
    });
  }

  static createComplexEvent(): Event<{ data: string; value: number }> {
    return Event.create('complex.event', {
      data: 'test-data',
      value: 42,
    });
  }

  static createErrorEvent(): Event<{ error: string; code: number }> {
    return Event.create('error.event', {
      error: 'Test error',
      code: 500,
    });
  }

  static createUserEvent(): Event<{ userId: string; action: string }> {
    return Event.create('user.action', {
      userId: 'user-123',
      action: 'login',
    });
  }
}
