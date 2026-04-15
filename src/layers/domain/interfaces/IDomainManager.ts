/**
 * Domain Manager Interface
 * 
 * Defines the contract for domain operations
 * including entity management, value objects, and domain events.
 */

import {
  DomainEntity,
  ValueObject,
  DomainEvent,
  AggregateRoot,
  DomainResult,
} from '../types/domain-types';

/**
 * Interface for domain operations
 */
export interface IDomainManager {
  /**
   * Creates a new domain entity
   * 
   * @param entity - Entity to create
   * @returns Domain result with created entity
   */
  createEntity<T extends DomainEntity>(entity: T): Promise<DomainResult<T>>;

  /**
   * Updates an existing domain entity
   * 
   * @param entity - Entity to update
   * @returns Domain result with updated entity
   */
  updateEntity<T extends DomainEntity>(entity: T): Promise<DomainResult<T>>;

  /**
   * Deletes a domain entity
   * 
   * @param entityId - ID of entity to delete
   * @returns Domain result
   */
  deleteEntity(entityId: string): Promise<DomainResult<void>>;

  /**
   * Gets an entity by ID
   * 
   * @param entityId - ID of entity to get
   * @returns Domain result with entity
   */
  getEntity<T extends DomainEntity>(entityId: string): Promise<DomainResult<T>>;

  /**
   * Publishes a domain event
   * 
   * @param event - Domain event to publish
   */
  publishEvent(event: DomainEvent): void;

  /**
   * Gets all uncommitted events for an aggregate
   * 
   * @param aggregateId - Aggregate ID
   * @returns Array of uncommitted events
   */
  getUncommittedEvents(aggregateId: string): DomainEvent[];

  /**
   * Compares two value objects for equality
   * 
   * @param vo1 - First value object
   * @param vo2 - Second value object
   * @returns True if equal, false otherwise
   */
  equals(vo1: ValueObject, vo2: ValueObject): boolean;

  /**
   * Validates a domain entity
   * 
   * @param entity - Entity to validate
   * @returns Domain result with validation status
   */
  validateEntity<T extends DomainEntity>(entity: T): DomainResult<T>;
}
