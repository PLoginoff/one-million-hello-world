/**
 * Domain Layer Types
 * 
 * This module defines all type definitions for the Domain Layer,
 * including core entities, value objects, and domain events.
 */

/**
 * Domain entity base interface
 */
export interface DomainEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Value object base interface
 */
export interface ValueObject {
  equals(other: ValueObject): boolean;
}

/**
 * Domain event
 */
export interface DomainEvent {
  eventType: string;
  aggregateId: string;
  occurredAt: Date;
  data?: Record<string, unknown>;
}

/**
 * Aggregate root
 */
export interface AggregateRoot extends DomainEntity {
  version: number;
  getUncommittedEvents(): DomainEvent[];
  markEventsAsCommitted(): void;
}

/**
 * Domain error
 */
export interface DomainError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Domain result
 */
export interface DomainResult<T> {
  success: boolean;
  value?: T;
  error?: DomainError;
}
