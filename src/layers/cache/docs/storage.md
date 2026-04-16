# Storage Layer Documentation

## Overview

The Storage Layer provides abstractions for cache storage backends. This design allows the Cache Layer to work with different storage implementations (in-memory, distributed, etc.) without changing core cache logic.

## Structure

```
storage/
├── interfaces/         # Storage interfaces
│   ├── IStorage.ts
│   └── index.ts
├── implementations/    # Storage implementations
│   ├── in-memory/
│   │   ├── InMemoryStorage.ts
│   │   └── index.ts
│   ├── distributed/
│   │   ├── DistributedStorage.ts
│   │   └── index.ts
│   └── index.ts
└── index.ts
```

## Storage Interface

### IStorage Interface

Base interface for all storage implementations.

```typescript
export interface IStorage<T> {
  get(key: string): CacheEntry<T> | undefined;
  set(key: string, entry: CacheEntry<T>): void;
  delete(key: string): boolean;
  has(key: string): boolean;
  keys(): string[];
  entries(): CacheEntry<T>[];
  size(): number;
  clear(): void;
  getType(): string;
}
```

**Methods:**
- `get(key: string)`: Retrieve entry by key
- `set(key: string, entry: CacheEntry<T>)`: Store entry
- `delete(key: string)`: Remove entry, returns true if existed
- `has(key: string)`: Check if key exists
- `keys()`: Get all keys
- `entries()`: Get all entries
- `size()`: Get current size
- `clear()`: Remove all entries
- `getType()`: Get storage type identifier

## Storage Implementations

### InMemoryStorage

Simple in-memory storage using JavaScript Map.

```typescript
import { InMemoryStorage } from '../storage/implementations/in-memory/InMemoryStorage';

const storage = new InMemoryStorage<string>();

storage.set('key1', entry1);
const entry = storage.get('key1');
storage.delete('key1');
storage.clear();
```

**Characteristics:**
- Fast O(1) operations
- Process-local storage
- Lost on process restart
- No persistence
- No network overhead

**Use Cases:**
- Single-process applications
- Temporary caching
- Development/testing
- High-performance scenarios

**Performance:**
- `get()`: O(1)
- `set()`: O(1)
- `delete()`: O(1)
- `has()`: O(1)
- `keys()`: O(n)
- `entries()`: O(n)
- `size()`: O(1)
- `clear()`: O(1)

### DistributedStorage

Placeholder for distributed cache storage (Redis, Memcached, etc.).

```typescript
import { DistributedStorage } from '../storage/implementations/distributed/DistributedStorage';

const storage = new DistributedStorage<string>('node-1');

storage.set('key1', entry1);
const entry = storage.get('key1');
await storage.sync(); // Sync with other nodes
```

**Characteristics:**
- Network-based storage
- Shared across processes/nodes
- Persistent (depends on backend)
- Requires network configuration
- Higher latency than in-memory

**Use Cases:**
- Multi-process applications
- Distributed systems
- Production environments
- Shared cache scenarios

**Performance:**
- `get()`: O(1) + network latency
- `set()`: O(1) + network latency
- `delete()`: O(1) + network latency
- `has()`: O(1) + network latency
- `keys()`: O(n) + network latency
- `entries()`: O(n) + network latency
- `size()`: O(1) + network latency
- `clear()`: O(n) + network latency

## Storage Factory

### StorageFactory

Factory for creating storage instances.

```typescript
import { StorageFactory } from '../factories/storage/StorageFactory';

// Create by type
const inMemory = StorageFactory.create<string>('IN_MEMORY');
const distributed = StorageFactory.create<string>('DISTRIBUTED', { nodeId: 'node-1' });

// Create directly
const memory = StorageFactory.createInMemory<string>();
const dist = StorageFactory.createDistributed<string>('node-1');

// Get available types
const types = StorageFactory.getAvailableTypes(); // ['IN_MEMORY', 'DISTRIBUTED']
```

## Custom Storage Implementation

Create custom storage backend:

```typescript
import { IStorage } from '../storage/interfaces/IStorage';
import { CacheEntry } from '../domain/entities/CacheEntry';

export class RedisStorage<T> implements IStorage<T> {
  private client: RedisClient;
  private prefix: string;

  constructor(client: RedisClient, prefix: string = 'cache') {
    this.client = client;
    this.prefix = prefix;
  }

  async get(key: string): Promise<CacheEntry<T> | undefined> {
    const data = await this.client.get(`${this.prefix}:${key}`);
    if (!data) return undefined;
    return JSON.parse(data);
  }

  async set(key: string, entry: CacheEntry<T>): Promise<void> {
    await this.client.set(
      `${this.prefix}:${key}`,
      JSON.stringify(entry),
      'PX',
      entry.ttl
    );
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.client.del(`${this.prefix}:${key}`);
    return result > 0;
  }

  async has(key: string): Promise<boolean> {
    const result = await this.client.exists(`${this.prefix}:${key}`);
    return result > 0;
  }

  async keys(): Promise<string[]> {
    const pattern = `${this.prefix}:*`;
    const keys = await this.client.keys(pattern);
    return keys.map(k => k.replace(`${this.prefix}:`, ''));
  }

  async entries(): Promise<CacheEntry<T>[]> {
    const keys = await this.keys();
    const entries: CacheEntry<T>[] = [];
    
    for (const key of keys) {
      const entry = await this.get(key);
      if (entry) entries.push(entry);
    }
    
    return entries;
  }

  async size(): Promise<number> {
    const pattern = `${this.prefix}:*`;
    const keys = await this.client.keys(pattern);
    return keys.length;
  }

  async clear(): Promise<void> {
    const pattern = `${this.prefix}:*`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  getType(): string {
    return 'REDIS';
  }
}
```

## Storage Selection Guide

| Storage Type | Latency | Persistence | Scalability | Complexity | Use Case |
|--------------|---------|-------------|--------------|------------|----------|
| In-Memory    | <1ms    | No          | Low          | Low        | Single-process, high-performance |
| Distributed  | 1-10ms  | Yes         | High         | High       | Multi-process, production |
| Redis        | 1-5ms   | Yes         | High         | Medium     | Distributed, persistent |
| Memcached    | <1ms    | No          | High         | Low        | Distributed, volatile |

## Usage Examples

### Basic In-Memory Storage

```typescript
import { InMemoryStorage } from '../storage/implementations/in-memory/InMemoryStorage';
import { CacheEntry } from '../domain/entities/CacheEntry';

const storage = new InMemoryStorage<string>();
const entry = new CacheEntry('key1', 'value1', 60000);

storage.set('key1', entry);
const retrieved = storage.get('key1');
console.log(retrieved?.value); // 'value1'
```

### Using Storage Factory

```typescript
import { StorageFactory } from '../factories/storage/StorageFactory';

const storage = StorageFactory.createInMemory<string>();

storage.set('key1', entry1);
const entry = storage.get('key1');
```

### Integration with CacheService

```typescript
import { CacheService } from '../core/services/CacheService';
import { InMemoryStorage } from '../storage/implementations/in-memory/InMemoryStorage';

const storage = new InMemoryStorage<string>();
const cacheService = new CacheService(
  storage,
  evictionStrategy,
  invalidationStrategy,
  statsCollector,
  config
);
```

## Storage Patterns

### Multi-Tier Storage

```typescript
class MultiTierStorage<T> implements IStorage<T> {
  private l1: InMemoryStorage<T>;
  private l2: DistributedStorage<T>;

  constructor(l1: InMemoryStorage<T>, l2: DistributedStorage<T>) {
    this.l1 = l1;
    this.l2 = l2;
  }

  get(key: string): CacheEntry<T> | undefined {
    // Try L1 first
    let entry = this.l1.get(key);
    if (entry) return entry;

    // Try L2
    entry = this.l2.get(key);
    if (entry) {
      // Promote to L1
      this.l1.set(key, entry);
      return entry;
    }

    return undefined;
  }

  // ... implement other methods
}
```

### Write-Through Storage

```typescript
class WriteThroughStorage<T> implements IStorage<T> {
  private primary: IStorage<T>;
  private secondary: IStorage<T>;

  constructor(primary: IStorage<T>, secondary: IStorage<T>) {
    this.primary = primary;
    this.secondary = secondary;
  }

  set(key: string, entry: CacheEntry<T>): void {
    this.primary.set(key, entry);
    this.secondary.set(key, entry);
  }

  // ... implement other methods
}
```

### Write-Behind Storage

```typescript
class WriteBehindStorage<T> implements IStorage<T> {
  private primary: IStorage<T>;
  private secondary: IStorage<T>;
  private queue: Map<string, CacheEntry<T>>;

  set(key: string, entry: CacheEntry<T>): void {
    this.primary.set(key, entry);
    this.queue.set(key, entry);
    // Async write to secondary
  }

  private async flushQueue(): Promise<void> {
    for (const [key, entry] of this.queue.entries()) {
      await this.secondary.set(key, entry);
      this.queue.delete(key);
    }
  }

  // ... implement other methods
}
```

## Storage Monitoring

### Monitor Storage Size

```typescript
setInterval(() => {
  const size = storage.size();
  console.log(`Storage size: ${size}`);
  
  if (size > maxSize * 0.9) {
    console.warn('Storage nearly full');
  }
}, 60000);
```

### Monitor Storage Health

```typescript
async function checkStorageHealth(storage: IStorage<any>): Promise<boolean> {
  try {
    const testKey = '__health_check__';
    const testEntry = new CacheEntry(testKey, 'test', 1000);
    
    storage.set(testKey, testEntry);
    const retrieved = storage.get(testKey);
    storage.delete(testKey);
    
    return retrieved !== undefined;
  } catch (error) {
    return false;
  }
}
```

## Testing Storage

```typescript
describe('InMemoryStorage', () => {
  let storage: InMemoryStorage<string>;

  beforeEach(() => {
    storage = new InMemoryStorage<string>();
  });

  it('should store and retrieve entries', () => {
    const entry = new CacheEntry('key1', 'value1', 60000);
    storage.set('key1', entry);
    
    const retrieved = storage.get('key1');
    expect(retrieved?.value).toBe('value1');
  });

  it('should delete entries', () => {
    const entry = new CacheEntry('key1', 'value1', 60000);
    storage.set('key1', entry);
    
    const deleted = storage.delete('key1');
    expect(deleted).toBe(true);
    expect(storage.has('key1')).toBe(false);
  });

  it('should clear all entries', () => {
    storage.set('key1', entry1);
    storage.set('key2', entry2);
    
    storage.clear();
    expect(storage.size()).toBe(0);
  });
});
```

## Best Practices

1. **Choose right storage type**: Match storage to use case and scale
2. **Monitor storage size**: Prevent memory exhaustion
3. **Implement health checks**: Ensure storage is operational
4. **Handle failures gracefully**: Implement fallback mechanisms
5. **Consider persistence**: Decide if persistence is needed
6. **Optimize for access patterns**: Structure storage for common operations
7. **Use connection pooling**: For distributed storage backends
8. **Implement retry logic**: Handle network failures gracefully

## Migration Between Storage Types

```typescript
// Migrate from in-memory to distributed
async function migrateStorage<T>(
  from: IStorage<T>,
  to: IStorage<T>
): Promise<void> {
  const entries = from.entries();
  
  for (const entry of entries) {
    await to.set(entry.key, entry);
  }
  
  from.clear();
}
```
