# Storage Layer Documentation

## Overview

Storage backends behind the Cache Layer, abstracted by `IStorage<T>` so core logic is backend-agnostic.

## Structure

```
storage/
├── interfaces/IStorage.ts
└── implementations/
    ├── in-memory/InMemoryStorage.ts
    └── distributed/DistributedStorage.ts
```

## IStorage

```typescript
interface IStorage<T> {
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

## Implementations

### InMemoryStorage

`Map`-backed, process-local, no persistence. O(1) `get`/`set`/`delete`/`has`/`size`/`clear`; O(n) `keys`/`entries`. Use for single-process apps, dev/test, hot data.

```typescript
const storage = new InMemoryStorage<string>();
storage.set('k', new CacheEntry('k', 'v', 60000));
storage.get('k'); // entry
```

### DistributedStorage

Placeholder for shared backends (Redis/Memcached). Same interface + `sync()`; adds network latency to every op and O(n) `clear`. Use for multi-process/production shared caches.

## StorageFactory

```typescript
StorageFactory.create<T>('IN_MEMORY' | 'DISTRIBUTED', { nodeId });
StorageFactory.createInMemory<T>();
StorageFactory.createDistributed<T>('node-1');
StorageFactory.getAvailableTypes(); // ['IN_MEMORY','DISTRIBUTED']
```

## Custom Storage

Implement `IStorage<T>`; for remote stores serialize `CacheEntry` (e.g. `JSON.stringify` + `PX` TTL on Redis) and prefix keys (`cache:<key>`) so `keys()`/`entries()`/`size()`/`clear()` can pattern-scan. `getType()` returns a backend identifier.

## Selection Guide

| Type | Latency | Persistent | Scalable | Use case |
|---|---|---|---|---|
| In-Memory | <1 ms | No | Low | Single-process, high-perf |
| Distributed | 1–10 ms | Yes | High | Multi-process, production |
| Redis | 1–5 ms | Yes | High | Distributed persistence |
| Memcached | <1 ms | No | High | Distributed, volatile |

## Patterns

- **Multi-tier**: L1 `InMemoryStorage` in front of L2 `DistributedStorage`; promote L2 hits into L1.
- **Write-through**: `set` writes primary + secondary synchronously.
- **Write-behind**: `set` writes primary + enqueues async write to secondary.

## Integration

```typescript
const service = new CacheService(
  StorageFactory.createInMemory<string>(),
  evictionStrategy, invalidationStrategy, statsCollector, config);
```

## Best Practices

- Match storage to scale/persistence needs; monitor `size()` and health-check with a write/read/delete probe.
- For remote backends: connection-pool, retry transient failures, and fall back gracefully.
- Migrate by iterating `from.entries()` → `to.set(...)` → `from.clear()`.
