/**
 * Domain Engine — public exports.
 *
 * Executable domain core: aggregate root base with versioning + event
 * collection, value-object structural equality, specification
 * pattern, event-sourced rehydration, and the greeting policy domain
 * service.
 *
 * @module DomainLayer/Engine
 */

export * from './types';

export { AggregateRootBase, VersionConflictError } from './AggregateRoot';
export { ValueObjectBase, structuralEquals } from './ValueObject';
export { spec, evaluate, allOf, anyOf } from './Specification';
export {
  rehydrateFromHistory,
  validateAndSortHistory,
  snapshotState,
  EventHistoryError,
} from './EventSourcedAggregate';
export { GreetingPolicyService } from './GreetingPolicyService';
export type { GreetingRequest } from './GreetingPolicyService';
