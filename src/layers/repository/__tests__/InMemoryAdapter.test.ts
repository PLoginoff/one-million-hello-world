/**
 * In-Memory Adapter Unit Tests
 */

import { InMemoryAdapter } from '../adapters/InMemoryAdapter';
import { DomainEntity } from '../../domain/types/domain-types';
import { FilterOperator, SortDirection } from '../types/repository-types';

interface TestEntity extends DomainEntity {
  id: string;
  name: string;
  age: number;
  createdAt: Date;
  updatedAt: Date;
}

function createEntity(id: string, name: string, age: number): TestEntity {
  return { id, name, age, createdAt: new Date(), updatedAt: new Date() };
}

describe('InMemoryAdapter', () => {
  let adapter: InMemoryAdapter<TestEntity>;

  beforeEach(async () => {
    adapter = new InMemoryAdapter<TestEntity>();
    await adapter.connect();
  });

  afterEach(async () => {
    if (adapter.isConnected()) await adapter.clear();
    await adapter.disconnect();
  });

  it('should return type IN_MEMORY', () => {
    expect(adapter.getType()).toBe('IN_MEMORY');
  });

  it('should be connected after connect', () => {
    expect(adapter.isConnected()).toBe(true);
  });

  it('should throw when not connected', async () => {
    await adapter.disconnect();
    await expect(adapter.findById('x')).rejects.toThrow('not connected');
  });

  it('should save and find by ID', async () => {
    const entity = createEntity('1', 'Alice', 30);
    await adapter.save(entity);
    const result = await adapter.findById('1');
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe('Alice');
  });

  it('should return error for missing entity', async () => {
    const result = await adapter.findById('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('ENTITY_NOT_FOUND');
  });

  it('should find all entities', async () => {
    await adapter.save(createEntity('1', 'Alice', 30));
    await adapter.save(createEntity('2', 'Bob', 25));
    const result = await adapter.find();
    expect(result.success).toBe(true);
    expect(result.data!.length).toBe(2);
  });

  it('should filter by EQUALS', async () => {
    await adapter.save(createEntity('1', 'Alice', 30));
    await adapter.save(createEntity('2', 'Bob', 25));
    const result = await adapter.find({
      filters: [{ field: 'name', operator: FilterOperator.EQUALS, value: 'Alice' }],
    });
    expect(result.data!.length).toBe(1);
    expect(result.data![0].name).toBe('Alice');
  });

  it('should filter by GREATER_THAN', async () => {
    await adapter.save(createEntity('1', 'Alice', 30));
    await adapter.save(createEntity('2', 'Bob', 25));
    const result = await adapter.find({
      filters: [{ field: 'age', operator: FilterOperator.GREATER_THAN, value: 26 }],
    });
    expect(result.data!.length).toBe(1);
    expect(result.data![0].name).toBe('Alice');
  });

  it('should filter by IN', async () => {
    await adapter.save(createEntity('1', 'Alice', 30));
    await adapter.save(createEntity('2', 'Bob', 25));
    await adapter.save(createEntity('3', 'Charlie', 35));
    const result = await adapter.find({
      filters: [{ field: 'name', operator: FilterOperator.IN, value: ['Alice', 'Bob'] }],
    });
    expect(result.data!.length).toBe(2);
  });

  it('should sort ascending', async () => {
    await adapter.save(createEntity('1', 'Charlie', 35));
    await adapter.save(createEntity('2', 'Alice', 30));
    await adapter.save(createEntity('3', 'Bob', 25));
    const result = await adapter.find({
      sorts: [{ field: 'name', direction: SortDirection.ASC }],
    });
    expect(result.data![0].name).toBe('Alice');
    expect(result.data![2].name).toBe('Charlie');
  });

  it('should sort descending', async () => {
    await adapter.save(createEntity('1', 'Alice', 30));
    await adapter.save(createEntity('2', 'Charlie', 35));
    await adapter.save(createEntity('3', 'Bob', 25));
    const result = await adapter.find({
      sorts: [{ field: 'name', direction: SortDirection.DESC }],
    });
    expect(result.data![0].name).toBe('Charlie');
  });

  it('should apply limit and offset', async () => {
    for (let i = 1; i <= 5; i++) {
      await adapter.save(createEntity(String(i), `User${i}`, 20 + i));
    }
    const result = await adapter.find({ limit: 2, offset: 1 });
    expect(result.data!.length).toBe(2);
  });

  it('should delete entity', async () => {
    await adapter.save(createEntity('1', 'Alice', 30));
    await adapter.delete('1');
    const result = await adapter.findById('1');
    expect(result.success).toBe(false);
  });

  it('should return error when deleting missing entity', async () => {
    const result = await adapter.delete('nonexistent');
    expect(result.success).toBe(false);
  });

  it('should count entities', async () => {
    await adapter.save(createEntity('1', 'Alice', 30));
    await adapter.save(createEntity('2', 'Bob', 25));
    const result = await adapter.count();
    expect(result.data).toBe(2);
  });

  it('should count with filters', async () => {
    await adapter.save(createEntity('1', 'Alice', 30));
    await adapter.save(createEntity('2', 'Bob', 25));
    const result = await adapter.count({
      filters: [{ field: 'name', operator: FilterOperator.EQUALS, value: 'Alice' }],
    });
    expect(result.data).toBe(1);
  });

  it('should clear all data', async () => {
    await adapter.save(createEntity('1', 'Alice', 30));
    await adapter.clear();
    expect(adapter.getSize()).toBe(0);
  });
});
