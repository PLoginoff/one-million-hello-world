/**
 * EventTestHelpers - Testing Utility
 * 
 * Helper functions for event testing.
 * Provides assertion helpers and test utilities.
 */

import { Event } from '../domain/entities/Event';
import { EventId } from '../domain/value-objects/EventId';
import { EventType } from '../domain/value-objects/EventType';

export class EventTestHelpers {
  static assertEventEquals(event1: Event, event2: Event): void {
    expect(event1.id.value).toBe(event2.id.value);
    expect(event1.type.value).toBe(event2.type.value);
    expect(event1.payload.data).toEqual(event2.payload.data);
  }

  static assertEventsEqual(events1: Event[], events2: Event[]): void {
    expect(events1.length).toBe(events2.length);
    for (let i = 0; i < events1.length; i++) {
      this.assertEventEquals(events1[i], events2[i]);
    }
  }

  static assertEventCorrelation(event1: Event, event2: Event): void {
    expect(event1.isCorrelatedWith(event2)).toBe(true);
    expect(event1.metadata.correlationId).toBe(event2.metadata.correlationId);
  }

  static assertEventSequence(events: Event[]): void {
    for (let i = 1; i < events.length; i++) {
      expect(events[i].occurredAfter(events[i - 1])).toBe(true);
    }
  }

  static assertEventType(event: Event, expectedType: string): void {
    expect(event.type.value).toBe(expectedType);
  }

  static assertEventPayload<T>(event: Event<T>, expectedPayload: T): void {
    expect(event.payload.data).toEqual(expectedPayload);
  }

  static waitForEvent(
    eventType: string,
    callback: () => void,
    timeout: number = 5000
  ): Promise<Event> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeout);

      callback();

      setTimeout(() => {
        clearTimeout(timer);
        resolve(null as any);
      }, 100);
    });
  }

  static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static generateTestEvents(count: number): Event<{ index: number }>[] {
    const events: Event<{ index: number }>[] = [];
    for (let i = 0; i < count; i++) {
      events.push(Event.create('test.event', { index: i }));
    }
    return events;
  }

  static generateEventTypes(count: number): string[] {
    const types: string[] = [];
    for (let i = 0; i < count; i++) {
      types.push(`test.event.${i}`);
    }
    return types;
  }

  static createMockHandler(): jest.Mock {
    return jest.fn();
  }

  static createAsyncMockHandler(): jest.Mock {
    return jest.fn().mockResolvedValue(undefined);
  }

  static createThrowingHandler(error: Error): jest.Mock {
    return jest.fn(() => {
      throw error;
    });
  }

  static createDelayedHandler(delay: number): jest.Mock {
    return jest.fn(async () => {
      await this.delay(delay);
    });
  }

  static extractEventIds(events: Event[]): string[] {
    return events.map(e => e.id.value);
  }

  static extractEventTypes(events: Event[]): string[] {
    return events.map(e => e.type.value);
  }

  static groupEventsByType(events: Event[]): Map<string, Event[]> {
    const grouped = new Map<string, Event[]>();
    for (const event of events) {
      const type = event.type.value;
      if (!grouped.has(type)) {
        grouped.set(type, []);
      }
      grouped.get(type)!.push(event);
    }
    return grouped;
  }

  static sortEventsByTime(events: Event[]): Event[] {
    return [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  static filterEventsByType(events: Event[], eventType: string): Event[] {
    return events.filter(e => e.type.value === eventType);
  }

  static filterEventsByCorrelation(events: Event[], correlationId: string): Event[] {
    return events.filter(e => e.metadata.correlationId === correlationId);
  }

  static countEventsByType(events: Event[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const event of events) {
      const type = event.type.value;
      counts.set(type, (counts.get(type) || 0) + 1);
    }
    return counts;
  }
}
