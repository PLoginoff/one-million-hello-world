/**
 * Domain Manager Implementation
 *
 * Concrete implementation of IDomainManager.
 * Handles entity management, value objects, and domain events.
 */

import { IDomainManager } from '../interfaces/IDomainManager';
import { DomainEntity, ValueObject, DomainEvent, DomainResult } from '../types/domain-types';

export class DomainManager implements IDomainManager {
  private _entities: Map<string, DomainEntity>;
  private _events: Map<string, DomainEvent[]>;

  constructor() {
    this._entities = new Map();
    this._events = new Map();
  }

  createEntity<T extends DomainEntity>(entity: T): Promise<DomainResult<T>> {
    const validation = this.validateEntity(entity);
    if (!validation.success) {
      return Promise.resolve(validation);
    }

    this._entities.set(entity.id, entity);
    return Promise.resolve({ success: true, value: entity });
  }

  updateEntity<T extends DomainEntity>(entity: T): Promise<DomainResult<T>> {
    const validation = this.validateEntity(entity);
    if (!validation.success) {
      return Promise.resolve(validation);
    }

    if (!this._entities.has(entity.id)) {
      return Promise.resolve({
        success: false,
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity with ID ${entity.id} not found`,
        },
      });
    }

    entity.updatedAt = new Date();
    this._entities.set(entity.id, entity);
    return Promise.resolve({ success: true, value: entity });
  }

  deleteEntity(entityId: string): Promise<DomainResult<void>> {
    if (!this._entities.has(entityId)) {
      return Promise.resolve({
        success: false,
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity with ID ${entityId} not found`,
        },
      });
    }

    this._entities.delete(entityId);
    this._events.delete(entityId);
    return Promise.resolve({ success: true });
  }

  getEntity<T extends DomainEntity>(entityId: string): Promise<DomainResult<T>> {
    const entity = this._entities.get(entityId) as T | undefined;

    if (entity === undefined) {
      return Promise.resolve({
        success: false,
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity with ID ${entityId} not found`,
        },
      });
    }

    return Promise.resolve({ success: true, value: entity });
  }

  publishEvent(event: DomainEvent): void {
    const events = this._events.get(event.aggregateId) ?? [];
    events.push(event);
    this._events.set(event.aggregateId, events);
  }

  getUncommittedEvents(aggregateId: string): DomainEvent[] {
    return this._events.get(aggregateId) ?? [];
  }

  equals(vo1: ValueObject, vo2: ValueObject): boolean {
    return vo1.equals(vo2);
  }

  validateEntity<T extends DomainEntity>(entity: T): DomainResult<T> {
    if (!entity.id) {
      return {
        success: false,
        error: {
          code: 'INVALID_ENTITY',
          message: 'Entity must have an ID',
        },
      };
    }

    if (!entity.createdAt) {
      return {
        success: false,
        error: {
          code: 'INVALID_ENTITY',
          message: 'Entity must have a createdAt timestamp',
        },
      };
    }

    return { success: true, value: entity };
  }
}
