# Testing Guide

## Overview

Cache Layer tests run under `bun test` (importing `bun:test`). Principles: unit tests in isolation, integration tests for component wiring, performance tests for throughput/memory, and property-based tests for invariants.

## Unit Testing

### Domain Entities

```typescript
const entry = new CacheEntry('key', 'value', 60000);
entry.isExpired(Date.now() + 70000); // true
entry.recordAccess();                // accessCount 1
entry.clone();                       // preserves key/accessCount
```

Cover: construction (key/value/ttl), expiry via `isExpired`, `recordAccess`, `clone`.

### Value Objects

```typescript
TTL.seconds(60).toMilliseconds();  // 60000
TTL.minutes(5).toMilliseconds();   // 300000
TTL.seconds(0).isInfinite();       // true
```

### Strategies

```typescript
const strategy = new LRUEvictionStrategy<string>();
strategy.onAdd('k1', e1); strategy.onAdd('k2', e2);
strategy.onAccess('k1', e1);
strategy.selectEntryToEvict(entries); // 'k2' (least recently used)
strategy.reset();
```

Cover `selectEntryToEvict` ordering per strategy (LRU/LFU/FIFO/Random) and `reset`.

### Statistics Collectors

```typescript
collector.recordHit(); collector.recordHit(); collector.recordMiss();
collector.getStats().getHitRate(); // ≈ 0.666
collector.reset();
```

### Storage

```typescript
storage.set('k', new CacheEntry('k', 'v', 60000));
storage.get('k')?.value;  // 'v'
storage.delete('k');      // true
storage.clear();          // size() → 0
```

### CacheService

Wire `InMemoryStorage` + `LRUEvictionStrategy` + `TimeBasedInvalidationStrategy` + `BasicStatisticsCollector` + `DefaultConfigs.DEFAULT`. Cover: set/get round-trip, miss tracking (`stats.hits`/`misses`), pattern `invalidate('user:*')` removing only matching keys.

### CacheManager

Cover `set`/`get` (hit + `value`), miss (`hit === false`), `delete`, `clear` (`stats.size === 0`), `setConfig`/`getConfig`.

## Integration Testing

- `CacheFactory.create` / `createHighPerformance` produce working caches with expected presets (`maxSize: 100`, `defaultTTL: 30000` for high-perf).
- `CacheConfigBuilder` → `CacheConfigValidator.validate` accepts valid configs and rejects invalid ones (e.g. `withMaxSize(-1)`).

## Performance Testing

- **Throughput**: 10k `set` in <1 s, 10k `get` in <0.5 s.
- **Eviction**: `maxSize: 100` + 200 sets → `stats.size === 100`, `evictions > 0`.
- **Memory**: `size` never exceeds `maxSize` under load.

## Property-Based Testing

With `fast-check`: for arbitrary `(key, value)`, `set` then `get` returns `hit && value === value`; `set` → `delete` → `get` returns `!hit`.

## Test Utilities

```typescript
class CacheTestHelpers {
  static createTestCache<T>(config?) { return new CacheManager<T>(config); }
  static fillCache(cache, count) { for (let i=0;i<count;i++) cache.set(`key${i}`,`value${i}`); }
  static waitForTTL(ms) { return new Promise(r => setTimeout(r, ms)); }
}
```

## Coverage Targets

- Domain/Configuration/Strategies/Statistics/Storage/Factories/Utils: 100%
- Core: 90%+

## Running Tests

```bash
bun test ./src/layers/cache/
bun test ./src/layers/cache/__tests__/CacheManager.test.ts
bun test --coverage ./src/layers/cache/
```

## Best Practices

- Independent tests, AAA structure, descriptive names.
- Mock external deps; cover edge cases (empty key, TTL 0, full cache) and error paths (`CacheKeyError`).
- Keep unit tests fast; use `waitForTTL` sparingly (prefer short TTLs like 100 ms).
