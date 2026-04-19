/**
 * IDomainEvent - Domain Interface
 * 
 * Base interface for all domain events in the system.
 * Defines the contract that all domain events must follow.
 */

import { EventId } from '../value-objects/EventId';
import { EventType } from '../value-objects/EventType';
import { EventMetadata } from '../value-objects/EventMetadata';
import { EventPayload } from '../value-objects/EventPayload';

export interface IDomainEvent<T = unknown> {
  readonly id: EventId;
  readonly type: EventType;
  readonly payload: EventPayload<T>;
  readonly metadata: EventMetadata;
  readonly occurredAt: Date;

  occurredBefore(other: IDomainEvent): boolean;
  occurredAfter(other: IDomainEvent): boolean;
  isCorrelatedWith(other: IDomainEvent): boolean;
  toPrimitive(): object;
}
