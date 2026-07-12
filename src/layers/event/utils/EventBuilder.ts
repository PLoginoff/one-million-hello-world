/**
 * EventBuilder - Utility
 *
 * Builder pattern for constructing events with fluent API.
 * Provides convenient event creation with validation.
 */

import { Event, EventOptions } from '../domain/entities/Event';
import { EventId } from '../domain/value-objects/EventId';
import { EventType } from '../domain/value-objects/EventType';
import { EventMetadata } from '../domain/value-objects/EventMetadata';
import { EventPayload } from '../domain/value-objects/EventPayload';

export class EventBuilder<T = unknown> {
  private _options: EventOptions<T>;

  constructor() {
    this._options = {} as EventOptions<T>;
  }

  withId(id: EventId | string): EventBuilder<T> {
    this._options.id = typeof id === 'string' ? EventId.fromString(id) : id;
    return this;
  }

  withType(type: string | EventType): EventBuilder<T> {
    this._options.type = type;
    return this;
  }

  withPayload(payload: any): EventBuilder<any> {
    this._options.payload = payload instanceof EventPayload ? payload.data : payload;
    return this;
  }

  withMetadata(metadata: EventMetadata): EventBuilder<T> {
    this._options.metadata = metadata;
    return this;
  }

  withSource(source: string): EventBuilder<T> {
    const existingMetadata = this._options.metadata || EventMetadata.create('system');
    this._options.metadata = EventMetadata.fromJSON({
      ...existingMetadata.toJSON(),
      source,
    });
    return this;
  }

  withCorrelationId(correlationId: string): EventBuilder<T> {
    const existingMetadata = this._options.metadata || EventMetadata.create('system');
    this._options.metadata = EventMetadata.fromJSON({
      ...existingMetadata.toJSON(),
      correlationId,
    });
    return this;
  }

  withUserId(userId: string): EventBuilder<T> {
    const existingMetadata = this._options.metadata || EventMetadata.create('system');
    this._options.metadata = EventMetadata.fromJSON({
      ...existingMetadata.toJSON(),
      userId,
    });
    return this;
  }

  withTag(key: string, value: string): EventBuilder<T> {
    const existingMetadata = this._options.metadata || EventMetadata.create('system');
    this._options.metadata = existingMetadata.withTag(key, value);
    return this;
  }

  withOccurredAt(occurredAt: Date): EventBuilder<T> {
    this._options.occurredAt = occurredAt;
    return this;
  }

  withCausationId(causationId: string): EventBuilder<T> {
    const existingMetadata = this._options.metadata || EventMetadata.create('system');
    this._options.metadata = existingMetadata.withCausationId(causationId);
    return this;
  }

  build(): Event<T> {
    if (!this._options.metadata) {
      this._options.metadata = EventMetadata.create('system');
    }
    if (!this._options.occurredAt) {
      this._options.occurredAt = new Date();
    }
    return new Event(this._options);
  }

  static create<T>(): EventBuilder<T> {
    return new EventBuilder<T>();
  }

  static fromEvent<T>(event: Event<T>): EventBuilder<T> {
    return new EventBuilder<T>()
      .withId(event.id)
      .withType(event.type)
      .withPayload(event.payload.data)
      .withMetadata(event.metadata)
      .withOccurredAt(event.occurredAt);
  }
}
