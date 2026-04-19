/**
 * MockEventBus - Testing Utility
 * 
 * Mock implementation of IEventBus for testing purposes.
 * Provides spy functionality and call tracking.
 */

import { IEventBus, EventHandler } from '../core/interfaces';
import { Event } from '../domain/entities/Event';

export interface MockCall {
  eventType: string;
  event: Event;
  handler: EventHandler;
  timestamp: Date;
}

export class MockEventBus implements IEventBus {
  private _subscriptions: Map<string, EventHandler[]>;
  private _publishedEvents: Event[];
  private _calls: MockCall[];
  private _shouldThrow: boolean;
  private _throwError: Error;

  constructor() {
    this._subscriptions = new Map();
    this._publishedEvents = [];
    this._calls = [];
    this._shouldThrow = false;
    this._throwError = new Error('Mock error');
  }

  subscribe<T>(eventType: string, handler: EventHandler<T>): string {
    if (!this._subscriptions.has(eventType)) {
      this._subscriptions.set(eventType, []);
    }
    this._subscriptions.get(eventType)!.push(handler as EventHandler);
    return `mock-sub-${eventType}-${Date.now()}`;
  }

  once<T>(eventType: string, handler: EventHandler<T>): string {
    const wrappedHandler: EventHandler = (event: Event) => {
      handler(event);
      this.unsubscribe(`mock-sub-${eventType}`);
    };
    return this.subscribe(eventType, wrappedHandler);
  }

  unsubscribe(subscriptionId: string): void {
    const eventType = subscriptionId.replace('mock-sub-', '').split('-')[0];
    const handlers = this._subscriptions.get(eventType);
    if (handlers) {
      handlers.length = 0;
    }
  }

  publish<T>(event: Event<T>): void {
    this._publishedEvents.push(event);

    if (this._shouldThrow) {
      throw this._throwError;
    }

    const handlers = this._subscriptions.get(event.type.value) || [];
    for (const handler of handlers) {
      this._calls.push({
        eventType: event.type.value,
        event,
        handler,
        timestamp: new Date(),
      });
      handler(event);
    }
  }

  async publishAsync<T>(event: Event<T>): Promise<void> {
    this.publish(event);
  }

  clear(): void {
    this._subscriptions.clear();
    this._publishedEvents = [];
    this._calls = [];
  }

  getSubscriptionCount(): number {
    let count = 0;
    for (const handlers of this._subscriptions.values()) {
      count += handlers.length;
    }
    return count;
  }

  getPublishedEvents(): Event[] {
    return [...this._publishedEvents];
  }

  getCalls(): MockCall[] {
    return [...this._calls];
  }

  getCallCount(): number {
    return this._calls.length;
  }

  reset(): void {
    this.clear();
  }

  shouldThrow(shouldThrow: boolean, error?: Error): void {
    this._shouldThrow = shouldThrow;
    if (error) {
      this._throwError = error;
    }
  }

  wasEventPublished(eventType: string): boolean {
    return this._publishedEvents.some(e => e.type.value === eventType);
  }

  getPublishedEventsByType(eventType: string): Event[] {
    return this._publishedEvents.filter(e => e.type.value === eventType);
  }

  wasHandlerCalled(eventType: string): boolean {
    return this._calls.some(call => call.eventType === eventType);
  }

  getHandlerCallCount(eventType: string): number {
    return this._calls.filter(call => call.eventType === eventType).length;
  }
}
