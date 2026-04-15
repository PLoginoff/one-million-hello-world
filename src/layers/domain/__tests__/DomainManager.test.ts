/**
 * Domain Manager Unit Tests
 * 
 * Tests for DomainManager implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { DomainManager } from '../implementations/DomainManager';
import { DomainEntity, ValueObject, DomainEvent } from '../types/domain-types';

describe('DomainManager', () => {
  let manager: DomainManager;

  beforeEach(() => {
    manager = new DomainManager();
  });

  describe('createEntity', () => {
    it('should create a valid entity', async () => {
      const entity: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await manager.createEntity(entity);

      expect(result.success).toBe(true);
      expect(result.value).toEqual(entity);
    });

    it('should fail validation for entity without ID', async () => {
      const entity = {
        createdAt: new Date(),
        updatedAt: new Date(),
      } as DomainEntity;

      const result = await manager.createEntity(entity);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_ENTITY');
    });
  });

  describe('updateEntity', () => {
    it('should update an existing entity', async () => {
      const entity: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await manager.createEntity(entity);
      const updatedEntity = { ...entity, updatedAt: new Date() };
      const result = await manager.updateEntity(updatedEntity);

      expect(result.success).toBe(true);
    });

    it('should fail when entity does not exist', async () => {
      const entity: DomainEntity = {
        id: 'nonexistent',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await manager.updateEntity(entity);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENTITY_NOT_FOUND');
    });
  });

  describe('deleteEntity', () => {
    it('should delete an existing entity', async () => {
      const entity: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await manager.createEntity(entity);
      const result = await manager.deleteEntity('entity-1');

      expect(result.success).toBe(true);
    });

    it('should fail when entity does not exist', async () => {
      const result = await manager.deleteEntity('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENTITY_NOT_FOUND');
    });
  });

  describe('getEntity', () => {
    it('should get an existing entity', async () => {
      const entity: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await manager.createEntity(entity);
      const result = await manager.getEntity('entity-1');

      expect(result.success).toBe(true);
      expect(result.value?.id).toBe('entity-1');
    });

    it('should fail when entity does not exist', async () => {
      const result = await manager.getEntity('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENTITY_NOT_FOUND');
    });
  });

  describe('publishEvent', () => {
    it('should publish a domain event', () => {
      const event: DomainEvent = {
        eventType: 'TestEvent',
        aggregateId: 'aggregate-1',
        occurredAt: new Date(),
      };

      manager.publishEvent(event);
      const events = manager.getUncommittedEvents('aggregate-1');

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });
  });

  describe('getUncommittedEvents', () => {
    it('should return empty array for aggregate with no events', () => {
      const events = manager.getUncommittedEvents('aggregate-1');

      expect(events).toHaveLength(0);
    });
  });

  describe('equals', () => {
    it('should compare value objects using equals method', () => {
      const vo1: ValueObject = {
        equals: (other) => true,
      };
      const vo2: ValueObject = {
        equals: (other) => false,
      };

      expect(manager.equals(vo1, vo2)).toBe(true);
    });
  });

  describe('validateEntity', () => {
    it('should validate a valid entity', () => {
      const entity: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = manager.validateEntity(entity);

      expect(result.success).toBe(true);
    });

    it('should fail validation for entity without ID', () => {
      const entity = {
        createdAt: new Date(),
        updatedAt: new Date(),
      } as DomainEntity;

      const result = manager.validateEntity(entity);

      expect(result.success).toBe(false);
    });
  });
});
