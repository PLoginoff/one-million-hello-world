/**
 * Postgres Adapter Unit Tests
 */

import { PostgresAdapter, PostgresClientInterface } from '../adapters/PostgresAdapter';
import { DomainEntity } from '../../domain/types/domain-types';

interface TestEntity extends DomainEntity {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

function createEntity(id: string, name: string): TestEntity {
  return { id, name, createdAt: new Date(), updatedAt: new Date() };
}

function createMockPostgresClient(): PostgresClientInterface {
  const store = new Map<string, { data: unknown; created_at: Date; updated_at: Date }>();
  return {
    connect: async () => {},
    end: async () => {},
    query: async (text: string, params?: unknown[]) => {
      if (text.includes('CREATE TABLE')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith('INSERT')) {
        const id = params![0] as string;
        const data = JSON.parse(params![1] as string);
        store.set(id, { data, created_at: new Date(), updated_at: new Date() });
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith('SELECT data FROM')) {
        if (text.includes('WHERE id')) {
          const id = params![0] as string;
          const row = store.get(id);
          if (row === undefined) return { rows: [], rowCount: 0 };
          return { rows: [{ data: row.data }], rowCount: 1 };
        }
        const rows = Array.from(store.values()).map((v) => ({ data: v.data }));
        return { rows, rowCount: rows.length };
      }
      if (text.startsWith('DELETE')) {
        if (params !== undefined && params.length > 0) {
          const id = params[0] as string;
          return { rows: [], rowCount: store.delete(id) ? 1 : 0 };
        }
        const count = store.size;
        store.clear();
        return { rows: [], rowCount: count };
      }
      if (text.startsWith('SELECT COUNT')) {
        return { rows: [{ count: String(store.size) }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('PostgresAdapter', () => {
  let adapter: PostgresAdapter<TestEntity>;
  let client: PostgresClientInterface;

  beforeEach(async () => {
    client = createMockPostgresClient();
    adapter = new PostgresAdapter<TestEntity>(client, 'test_entities');
    await adapter.connect();
  });

  afterEach(async () => {
    if (adapter.isConnected()) await adapter.clear();
    await adapter.disconnect();
  });

  it('should return type POSTGRES', () => {
    expect(adapter.getType()).toBe('POSTGRES');
  });

  it('should be connected after connect', () => {
    expect(adapter.isConnected()).toBe(true);
  });

  it('should save and find by ID', async () => {
    const entity = createEntity('1', 'Alice');
    await adapter.save(entity);
    const result = await adapter.findById('1');
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe('Alice');
  });

  it('should return error for missing entity', async () => {
    const result = await adapter.findById('nonexistent');
    expect(result.success).toBe(false);
  });

  it('should find all entities', async () => {
    await adapter.save(createEntity('1', 'Alice'));
    await adapter.save(createEntity('2', 'Bob'));
    const result = await adapter.find();
    expect(result.data!.length).toBe(2);
  });

  it('should delete entity', async () => {
    await adapter.save(createEntity('1', 'Alice'));
    const result = await adapter.delete('1');
    expect(result.success).toBe(true);
  });

  it('should return error when deleting missing entity', async () => {
    const result = await adapter.delete('nonexistent');
    expect(result.success).toBe(false);
  });

  it('should count entities', async () => {
    await adapter.save(createEntity('1', 'Alice'));
    await adapter.save(createEntity('2', 'Bob'));
    const result = await adapter.count();
    expect(result.data).toBe(2);
  });

  it('should throw when not connected', async () => {
    await adapter.disconnect();
    await expect(adapter.findById('x')).rejects.toThrow('not connected');
  });
});
