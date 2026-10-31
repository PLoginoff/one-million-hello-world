# Core Layer Documentation

## Overview

The Core Layer contains the main cache logic that orchestrates the other layers. `CacheService` implements operations against `IStorage`/`IEvictionStrategy`/`IInvalidationStrategy`/`IStatisticsCollector`; `CacheManager` wraps it with the simpler public API (`ICacheManager`).

## Structure

```
core/
├── services/CacheService.ts   # layered cache operations
└── managers/CacheManager.ts   # orchestrator / public API
```

## CacheService

### Constructor

```typescript
constructor(
  storage: IStorage<T>,
  evictionStrategy: IEvictionStrategy<T>,
  invalidationStrategy: IInvalidationStrategy<T>,
  statsCollector: IStatisticsCollector,
  config: CacheConfigOptions
)
```

### Methods

- `get(key): CacheResult<T>` — storage lookup → invalidation check → on valid: record access + `onAccess` + hit; on stale: delete + miss. `result.hit`/`value`/`fromLevel`.
- `set(key, value, ttl?)` — creates entry, evicts if `size >= maxSize`, stores, notifies `onAdd`, updates stats. `ttl` in ms; omit for `config.defaultTTL`.
- `delete(key): boolean` — removes one entry; `false` when absent.
- `clear()` — removes all entries.
- `invalidate(pattern)` — deletes every key matching the pattern (`user:*`, `.*` for all).
- `getStats(): CacheStats` — `hits`, `misses`, `evictions`, `size`, `getHitRate()`, `getMissRate()`.
- `updateConfig(partial)` / `getConfig()` — runtime config read/write (`maxSize`, `defaultTTL`, …).
- `getEntries(): CacheEntry<T>[]` — all entries (each has `key`, `value`, `isExpired()`, `recordAccess()`).

## CacheManager

`new CacheManager<T>(config?: Partial<CacheConfigOptions>)` — same method surface as `CacheService` (`get`, `set`, `delete`, `clear`, `invalidate`, `getStats`, `setConfig`, `getConfig`, `getEntries`) with simpler signatures.

```typescript
const cache = new CacheManager<string>({
  maxSize: 500,
  defaultTTL: 30000,
  invalidationStrategy: InvalidationStrategy.LFU,
});
```

## Architecture Flow

### Read
`CacheManager.get → CacheService.get → Storage.get → InvalidationStrategy.shouldInvalidate`
- invalid → `Storage.delete` + `Stats.recordMiss` → miss
- valid → `entry.recordAccess` + `EvictionStrategy.onAccess` + `Stats.recordHit` → value

### Write
`CacheManager.set → CacheService.set` → if `size >= maxSize`: `EvictionStrategy.selectEntryToEvict` → `Storage.delete` + `recordEviction` → create `CacheEntry` → `Storage.set` → `onAdd` → `updateSize`.

## Usage

```typescript
cache.set('user:1', 'John Doe', 60000);
const r = cache.get('user:1');
if (r.hit) console.log(r.value);
cache.invalidate('user:*');           // pattern delete
const stats = cache.getStats();       // getHitRate(), evictions, size
cache.setConfig({ maxSize: 1000 });   // runtime tuning
```

## Integration

```typescript
// Custom wiring
const service = new CacheService(
  new CustomStorage<string>(),
  new LRUEvictionStrategy<string>(),
  new TimeBasedInvalidationStrategy<string>(),
  new DetailedStatisticsCollector(),
  DefaultConfigs.DEFAULT,
);
```

Errors: catch `CacheConfigError`, `CacheStorageError`, `CacheKeyError` (see `utils.md`).

## Performance

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| `get` | O(1) | lookup + validation |
| `set` | O(1) avg, O(n) worst | may trigger eviction |
| `delete` | O(1) | |
| `clear` | O(n) | |
| `invalidate` | O(n) | scans all keys |
| `getStats` | O(1) | cached counters |

Memory: ~1 KB base + value size + ~100 B metadata per entry + strategy overhead (LRU/LFU/FIFO O(n), Random O(0)).

## Common Patterns

- **Cache-aside**: `get` → miss → fetch → `set`.
- **Write-through**: write source, then `cache.set`.
- **Write-behind**: `cache.set` immediately, queue the source write.

## Troubleshooting

- **Low hit rate (<50%)**: raise `maxSize`/`TTL`, change strategy, analyze access patterns.
- **High memory**: lower `maxSize`/`TTL`, more aggressive eviction, add tiers.
- **Stale data**: shorter TTL, manual/time-based invalidation, refresh logic.
