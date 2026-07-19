/**
 * Event - Domain Entity
 *
 * Core domain entity representing an event in the system.
 * Immutable entity composed of value objects.
 */

import { IDomainEvent } from '../interfaces/IDomainEvent';
import { EventId } from '../value-objects/EventId';
import { EventType } from '../value-objects/EventType';
import { EventMetadata } from '../value-objects/EventMetadata';
import { EventPayload } from '../value-objects/EventPayload';

export interface EventOptions<T> {
  id?: EventId;
  type: string | EventType;
  payload: T;
  metadata?: EventMetadata;
  occurredAt?: Date;
}

export class Event<T = unknown> implements IDomainEvent<T> {
  readonly id: EventId;
  readonly type: EventType;
  readonly payload: EventPayload<T>;
  readonly metadata: EventMetadata;
  readonly occurredAt: Date;

  constructor(options: EventOptions<T>) {
    if (options.type === undefined) {
      throw new Error('Event: type is required');
    }
    if (options.payload === undefined) {
      throw new Error('Event: payload is required');
    }
    if (options.id === null) {
      throw new Error('Event: id is required');
    }
    if (options.metadata === null) {
      throw new Error('Event: metadata is required');
    }
    this.id = options.id ?? new EventId();
    this.type = options.type instanceof EventType ? options.type : new EventType(options.type);
    this.payload = options.payload instanceof EventPayload ? options.payload : new EventPayload(options.payload);
    this.metadata = options.metadata ?? EventMetadata.create('system');
    this.occurredAt = options.occurredAt ?? new Date();
    this._validate();
  }

  private _validate(): void {
    if (!(this.occurredAt instanceof Date) || Number.isNaN(this.occurredAt.getTime())) {
      throw new Error('Event: occurredAt must be a valid Date');
    }
  }

  occurredBefore(other: IDomainEvent): boolean {
    return this.occurredAt < other.occurredAt;
  }

  occurredAfter(other: IDomainEvent): boolean {
    return this.occurredAt > other.occurredAt;
  }

  isCorrelatedWith(other: IDomainEvent): boolean {
    return this.metadata.correlationId === other.metadata.correlationId;
  }

  withPayload<U>(newPayload: U): Event<U> {
    return new Event({
      id: this.id,
      type: this.type,
      payload: newPayload,
      metadata: this.metadata,
      occurredAt: this.occurredAt,
    });
  }

  withMetadata(metadata: EventMetadata): Event<T> {
    return new Event({
      id: this.id,
      type: this.type,
      payload: this.payload.data,
      metadata,
      occurredAt: this.occurredAt,
    });
  }

  withCausationId(causationId: string): Event<T> {
    return new Event({
      id: new EventId(),
      type: this.type,
      payload: this.payload.data,
      metadata: this.metadata.withCausationId(causationId),
      occurredAt: new Date(),
    });
  }

  withCorrelationId(correlationId: string): Event<T> {
    return new Event({
      id: new EventId(),
      type: this.type,
      payload: this.payload.data,
      metadata: EventMetadata.fromJSON({
        ...this.metadata.toJSON(),
        correlationId,
      }),
      occurredAt: new Date(),
    });
  }

  toPrimitive(): object {
    return {
      id: this.id.value,
      type: this.type.value,
      payload: this.payload.data,
      metadata: this.metadata.toJSON(),
      occurredAt: this.occurredAt.toISOString(),
    };
  }

  toJSON(): object {
    return this.toPrimitive();
  }

  toString(): string {
    return JSON.stringify(this.toPrimitive());
  }

  equals(other: Event<T>): boolean {
    if (!(other instanceof Event)) {
      return false;
    }
    return this.id.equals(other.id);
  }

  static create<T>(type: string, payload: T): Event<T> {
    return new Event({ type, payload, metadata: EventMetadata.create('system') });
  }

  static fromPrimitive<T>(primitive: unknown): Event<T> {
    const p = primitive as Record<string, unknown>;
    return new Event({
      id: EventId.fromString(p.id as string),
      type: EventType.fromString(p.type as string),
      payload: p.payload as T,
      metadata: EventMetadata.fromJSON(p.metadata),
      occurredAt: new Date(p.occurredAt as string | number | Date),
    });
  }
}
