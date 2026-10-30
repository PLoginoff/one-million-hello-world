/**
 * Domain Engine — Shared Types
 *
 * Type definitions for the executable domain core:
 * - Aggregate root base with version tracking + uncommitted events
 * - Value object base with structural equality
 * - Specification pattern for composable domain rules
 * - Event-sourced rehydration
 * - HelloWorld greeting policy domain service
 *
 * This module is the *runtime* for the domain layer — the `entities/`
 * and `domain/` trees carry static shapes; here are the algorithms.
 *
 * @module DomainLayer/Engine
 */

import { DomainEvent } from '../types/domain-types';

// ---------------------------------------------------------------------------
// Domain events
// ---------------------------------------------------------------------------

/**
 * Engine-level domain event — adds sequencing metadata to the base
 * {@link DomainEvent} so event stores can order replays.
 */
export interface EngineDomainEvent extends DomainEvent {
  /** Aggregate version at which the event was raised. */
  readonly sequenceNumber: number;
  /** Unique event id. */
  readonly eventId: string;
}

/** Event factory — wraps a raw payload in engine metadata. */
export interface EventFactory {
  (eventType: string, aggregateId: string, sequenceNumber: number, data?: Record<string, unknown>): EngineDomainEvent;
}

// ---------------------------------------------------------------------------
// Specification pattern
// ---------------------------------------------------------------------------

/**
 * A domain rule expressed as a predicate plus metadata for reporting.
 */
export interface Specification<T> {
  /** Human-readable rule name (used in `Reason` reports). */
  readonly name: string;
  /** Evaluate the rule. */
  isSatisfiedBy(candidate: T): boolean;
  /** Combinators — return new composite specs. */
  and(other: Specification<T>): Specification<T>;
  or(other: Specification<T>): Specification<T>;
  not(): Specification<T>;
}

/** Result of evaluating a specification — includes which rules failed. */
export interface SpecificationReport {
  readonly satisfied: boolean;
  readonly failures: readonly string[];
}

// ---------------------------------------------------------------------------
// Event sourcing
// ---------------------------------------------------------------------------

/**
 * Event store record — what an aggregate's history looks like at rest.
 */
export interface StoredEvent {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly sequenceNumber: number;
  readonly occurredAt: Date;
  readonly data?: Record<string, unknown>;
}

/**
 * Event handler table — map `eventType` → reducer. Used by
 * `rehydrateFromHistory` to rebuild aggregate state.
 */
export type EventHandlerTable<TAggregate> = Record<
  string,
  (aggregate: TAggregate, event: StoredEvent) => void
>;

/**
 * Rehydration outcome: the rebuilt aggregate plus the version reached.
 */
export interface RehydrationResult<TAggregate> {
  readonly aggregate: TAggregate;
  readonly version: number;
  readonly eventsApplied: number;
}

// ---------------------------------------------------------------------------
// Greeting policy (HelloWorld domain service)
// ---------------------------------------------------------------------------

/** Supported greeting languages with format rules. */
export interface GreetingLanguage {
  readonly code: string;
  readonly name: string;
  /** Salutation template; `{name}` is interpolated. */
  readonly template: string;
}

/** Policy decision result. */
export interface GreetingPolicyResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly formattedMessage?: string;
}

/** Audit entry for greeting requests. */
export interface GreetingAuditEntry {
  readonly requestedLanguage: string;
  readonly requestedName?: string;
  readonly allowed: boolean;
  readonly reason?: string;
  readonly timestamp: Date;
}
