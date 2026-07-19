/**
 * Redis Adapter Unit Tests
 */

import { RedisAdapter, RedisClientInterface } from '../adapters/RedisAdapter';
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

function createMockRedisClient(): RedisClientInterface {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
    },
    del: async (key: string) => {
      return store.delete(key) ? 1 : 0;
    },
    keys: async (pattern: string) => {
      const prefix = pattern.replace('*', '');
      return Array.from(store.keys()).filter((k) => k.startsWith(prefix));
    },
    ping: async () => 'PONG',
  };
}

describe('RedisAdapter', () => {
  let adapter: RedisAdapter<TestEntity>;
  let client: RedisClientInterface;

  beforeEach(async () => {
    client = createMockRedisClient();
    adapter = new RedisAdapter<TestEntity>(client, 'test:');
    await adapter.connect();
  });

  afterEach(async () => {
    if (adapter.isConnected()) await adapter.clear();
    await adapter.disconnect();
  });

  it('should return type REDIS', () => {
    expect(adapter.getType()).toBe('REDIS');
  });

  it('should connect when ping returns PONG', async () => {
    expect(adapter.isConnected()).toBe(true);
  });

  it('should throw on connect if ping fails', async () => {
    const badClient: RedisClientInterface = {
      ...createMockRedisClient(),
      ping: async () => 'ERROR',
    };
    const badAdapter = new RedisAdapter<TestEntity>(badClient);
    await expect(badAdapter.connect()).rejects.toThrow('Redis ping failed');
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
    await adapter.delete('1');
    const result = await adapter.findById('1');
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
