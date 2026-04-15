/**
 * Repository Unit Tests
 * 
 * Tests for Repository implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Repository } from '../implementations/Repository';
import { DomainEntity } from '../../domain/types/domain-types';
import { QueryOptions, FilterOperator, SortDirection } from '../types/repository-types';

describe('Repository', () => {
  let repository: Repository<DomainEntity>;

  beforeEach(() => {
    repository = new Repository<DomainEntity>();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = repository.getConfig();

      expect(config).toBeDefined();
      expect(config.enableCaching).toBe(false);
      expect(config.enableTransaction).toBe(false);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableCaching: true,
        cacheTimeout: 30000,
        enableTransaction: true,
      };

      repository.setConfig(newConfig);
      const config = repository.getConfig();

      expect(config.enableCaching).toBe(true);
      expect(config.enableTransaction).toBe(true);
    });
  });

  describe('save', () => {
    it('should save an entity', async () => {
      const entity: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await repository.save(entity);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(entity);
    });
  });

  describe('findById', () => {
    it('should find an existing entity', async () => {
      const entity: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.save(entity);
      const result = await repository.findById('entity-1');

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('entity-1');
    });

    it('should fail when entity does not exist', async () => {
      const result = await repository.findById('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENTITY_NOT_FOUND');
    });
  });

  describe('find', () => {
    it('should return all entities', async () => {
      const entity1: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const entity2: DomainEntity = {
        id: 'entity-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.save(entity1);
      await repository.save(entity2);
      const result = await repository.find();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should apply filters', async () => {
      const entity1: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const entity2: DomainEntity = {
        id: 'entity-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.save(entity1);
      await repository.save(entity2);

      const options: QueryOptions = {
        filters: [{ field: 'id', operator: FilterOperator.EQUALS, value: 'entity-1' }],
      };

      const result = await repository.find(options);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].id).toBe('entity-1');
    });

    it('should apply limit', async () => {
      const entity1: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const entity2: DomainEntity = {
        id: 'entity-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.save(entity1);
      await repository.save(entity2);

      const options: QueryOptions = {
        limit: 1,
      };

      const result = await repository.find(options);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('should delete an existing entity', async () => {
      const entity: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.save(entity);
      const result = await repository.delete('entity-1');

      expect(result.success).toBe(true);
    });

    it('should fail when entity does not exist', async () => {
      const result = await repository.delete('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENTITY_NOT_FOUND');
    });
  });

  describe('count', () => {
    it('should count all entities', async () => {
      const entity1: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const entity2: DomainEntity = {
        id: 'entity-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.save(entity1);
      await repository.save(entity2);
      const result = await repository.count();

      expect(result.success).toBe(true);
      expect(result.data).toBe(2);
    });
  });

  describe('exists', () => {
    it('should return true for existing entity', async () => {
      const entity: DomainEntity = {
        id: 'entity-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.save(entity);
      const result = await repository.exists('entity-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should return false for non-existent entity', async () => {
      const result = await repository.exists('nonexistent');

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear cache', () => {
      repository.clearCache();
      expect(repository.getConfig().enableCaching).toBe(false);
    });
  });
});
