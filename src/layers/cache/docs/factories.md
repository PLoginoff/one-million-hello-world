# Factories Layer Documentation

## Overview

Factory classes for creating cache components and fully configured `CacheManager` instances — preferred over direct `CacheService` wiring.

## Structure

```
factories/
├── strategies/EvictionStrategyFactory.ts
├── storage/StorageFactory.ts
└── cache/CacheFactory.ts
```

## EvictionStrategyFactory

```typescript
EvictionStrategyFactory.create<T>(InvalidationStrategy.LRU);
EvictionStrategyFactory.createLRU<T>();
EvictionStrategyFactory.createLFU<T>();
EvictionStrategyFactory.createFIFO<T>();
EvictionStrategyFactory.createRandom<T>();
EvictionStrategyFactory.getAvailableStrategies(); // ['LRU','LFU','FIFO','RANDOM']
```

## StorageFactory

```typescript
StorageFactory.create<T>('IN_MEMORY');
StorageFactory.create<T>('DISTRIBUTED', { nodeId: 'node-1' });
StorageFactory.createInMemory<T>();
StorageFactory.createDistributed<T>('node-1');
StorageFactory.getAvailableTypes(); // ['IN_MEMORY','DISTRIBUTED']
```

## CacheFactory

```typescript
CacheFactory.create<T>(config?, options?);
CacheFactory.createCustom<T>(config: CacheConfigOptions, options?);
```

`CacheFactoryOptions`: `{ storageType?: 'IN_MEMORY' | 'DISTRIBUTED'; useDetailedStats?: boolean; nodeId?: string }`.

### Pre-configured caches

| Factory | Preset | Best for |
|---|---|---|
| `createHighPerformance<T>()` | maxSize 100, TTL 30 s, LRU | Hot data, low latency (L1) |
| `createLargeCache<T>()` | maxSize 10000, TTL 5 min, LFU | Large/cold datasets (L3) |
| `createMultiLevel<T>()` | maxSize 1000, TTL 60 s, LRU, `enableMultiLevel` | Hierarchical tiers |
| `createTimeBased<T>()` | maxSize 500, TTL 2 min, TIME_BASED | Sessions, API responses |

```typescript
const cache = CacheFactory.create<string>(
  { maxSize: 1000 },
  { storageType: 'DISTRIBUTED', nodeId: 'node-1', useDetailedStats: true },
);
```

### With a builder config

```typescript
const config = CacheConfigBuilder.create()
  .withMaxSize(2000).withDefaultTTLSeconds(120)
  .withInvalidationStrategy(InvalidationStrategy.LFU).build();

const cache = CacheFactory.createCustom<string>(config);
```

## Patterns

- **Environment-aware**: pick `storageType` from `NODE_ENV` (`DISTRIBUTED` in prod, `IN_MEMORY` otherwise) and `useDetailedStats` in dev.
- **Domain factories**: extend `CacheFactory` with presets per use case (web/API/session caches with tuned `maxSize`/`TTL`/strategy).

## Best Practices

- Use factories instead of manual `CacheService` assembly (storage + eviction + invalidation + stats + config).
- Prefer presets when they fit; use `createCustom` + `CacheConfigBuilder` for exact control.
- Keep env-specific options behind a single creation function.

## Troubleshooting

- **Unexpected config** — check preset defaults vs your `config` overrides.
- **Custom factory not working** — verify `static` methods and `extends CacheFactory`.
- **Storage type unavailable** — inspect `StorageFactory.getAvailableTypes()`.
