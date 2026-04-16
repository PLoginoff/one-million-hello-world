# Testing Guide

## Overview

This document provides comprehensive testing strategies for the Cache Layer.

## Testing Philosophy

The Cache Layer follows these testing principles:

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test component interactions
3. **Performance Tests**: Validate performance characteristics
4. **Property-Based Tests**: Test with random inputs
5. **Mutation Tests**: Ensure test quality

## Unit Testing

### Testing Domain Entities

```typescript
import { CacheEntry } from '../domain/entities/CacheEntry';

describe('CacheEntry', () => {
  it('should create entry with valid data', () => {
    const entry = new CacheEntry('key', 'value', 60000);
    expect(entry.key).toBe('key');
    expect(entry.value).toBe('value');
    expect(entry.ttl).toBe(60000);
  });

  it('should expire after TTL', () => {
    const entry = new CacheEntry('key', 'value', 100);
    expect(entry.isExpired(Date.now() + 150)).toBe(true);
  });

  it('should track access count', () => {
    const entry = new CacheEntry('key', 'value', 60000);
    entry.recordAccess();
    expect(entry.accessCount).toBe(1);
  });

  it('should clone correctly', () => {
    const entry = new CacheEntry('key', 'value', 60000);
    entry.recordAccess();
    const cloned = entry.clone();
    expect(cloned.accessCount).toBe(1);
    expect(cloned.key).toBe(entry.key);
  });
});
```

### Testing Value Objects

```typescript
import { TTL, TimeUnit } from '../domain/value-objects/TTL';

describe('TTL', () => {
  it('should create from seconds', () => {
    const ttl = TTL.seconds(60);
    expect(ttl.toMilliseconds()).toBe(60000);
  });

  it('should create from minutes', () => {
    const ttl = TTL.minutes(5);
    expect(ttl.toMilliseconds()).toBe(300000);
  });

  it('should detect infinite TTL', () => {
    const ttl = TTL.seconds(0);
    expect(ttl.isInfinite()).toBe(true);
  });
});
```

### Testing Strategies

```typescript
import { LRUEvictionStrategy } from '../strategies/eviction/LRUEvictionStrategy';
import { CacheEntry } from '../domain/entities/CacheEntry';

describe('LRUEvictionStrategy', () => {
  let strategy: LRUEvictionStrategy<string>;

  beforeEach(() => {
    strategy = new LRUEvictionStrategy<string>();
  });

  it('should evict least recently used', () => {
    const entries = new Map<string, CacheEntry<string>>();
    const entry1 = new CacheEntry('key1', 'value1', 60000);
    const entry2 = new CacheEntry('key2', 'value2', 60000);

    entries.set('key1', entry1);
    entries.set('key2', entry2);

    strategy.onAdd('key1', entry1);
    strategy.onAdd('key2', entry2);

    // Access key1
    strategy.onAccess('key1', entry1);

    // key2 should be evicted (least recently accessed)
    const evicted = strategy.selectEntryToEvict(entries);
    expect(evicted).toBe('key2');
  });

  it('should reset state', () => {
    const entry = new CacheEntry('key1', 'value1', 60000);
    strategy.onAdd('key1', entry);
    strategy.reset();
    // State should be cleared
  });
});
```

### Testing Statistics Collectors

```typescript
import { BasicStatisticsCollector } from '../statistics/collectors/BasicStatisticsCollector';

describe('BasicStatisticsCollector', () => {
  let collector: BasicStatisticsCollector;

  beforeEach(() => {
    collector = new BasicStatisticsCollector();
  });

  it('should track hits', () => {
    collector.recordHit();
    const stats = collector.getStats();
    expect(stats.hits).toBe(1);
  });

  it('should track misses', () => {
    collector.recordMiss();
    const stats = collector.getStats();
    expect(stats.misses).toBe(1);
  });

  it('should calculate hit rate correctly', () => {
    collector.recordHit();
    collector.recordHit();
    collector.recordMiss();

    const stats = collector.getStats();
    expect(stats.getHitRate()).toBeCloseTo(0.666, 2);
  });

  it('should reset statistics', () => {
    collector.recordHit();
    collector.reset();
    const stats = collector.getStats();
    expect(stats.hits).toBe(0);
  });
});
```

### Testing Storage

```typescript
import { InMemoryStorage } from '../storage/implementations/in-memory/InMemoryStorage';
import { CacheEntry } from '../domain/entities/CacheEntry';

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

  it('should return correct size', () => {
    storage.set('key1', entry1);
    storage.set('key2', entry2);
    expect(storage.size()).toBe(2);
  });
});
```

### Testing Cache Service

```typescript
import { CacheService } from '../core/services/CacheService';
import { InMemoryStorage } from '../storage/implementations/in-memory/InMemoryStorage';
import { LRUEvictionStrategy } from '../strategies/eviction/LRUEvictionStrategy';
import { TimeBasedInvalidationStrategy } from '../strategies/invalidation/TimeBasedInvalidationStrategy';
import { BasicStatisticsCollector } from '../statistics/collectors/BasicStatisticsCollector';
import { DefaultConfigs } from '../configuration/defaults/DefaultConfigs';

describe('CacheService', () => {
  let cacheService: CacheService<string>;

  beforeEach(() => {
    const storage = new InMemoryStorage<string>();
    const evictionStrategy = new LRUEvictionStrategy<string>();
    const invalidationStrategy = new TimeBasedInvalidationStrategy<string>();
    const statsCollector = new BasicStatisticsCollector();
    const config = DefaultConfigs.DEFAULT;

    cacheService = new CacheService(
      storage,
      evictionStrategy,
      invalidationStrategy,
      statsCollector,
      config
    );
  });

  it('should store and retrieve values', () => {
    cacheService.set('key1', 'value1');
    const result = cacheService.get('key1');

    expect(result.hit).toBe(true);
    expect(result.value).toBe('value1');
  });

  it('should track statistics', () => {
    cacheService.set('key1', 'value1');
    cacheService.get('key1');
    cacheService.get('nonexistent');

    const stats = cacheService.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should invalidate by pattern', () => {
    cacheService.set('user:1', 'user1');
    cacheService.set('user:2', 'user2');
    cacheService.set('product:1', 'product1');

    cacheService.invalidate('user:*');

    expect(cacheService.get('user:1').hit).toBe(false);
    expect(cacheService.get('user:2').hit).toBe(false);
    expect(cacheService.get('product:1').hit).toBe(true);
  });
});
```

### Testing Cache Manager

```typescript
import { CacheManager } from '../core/managers/CacheManager';

describe('CacheManager', () => {
  let cache: CacheManager<string>;

  beforeEach(() => {
    cache = new CacheManager<string>();
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    const result = cache.get('key1');

    expect(result.hit).toBe(true);
    expect(result.value).toBe('value1');
  });

  it('should handle cache misses', () => {
    const result = cache.get('nonexistent');
    expect(result.hit).toBe(false);
  });

  it('should delete entries', () => {
    cache.set('key1', 'value1');
    cache.delete('key1');
    const result = cache.get('key1');
    expect(result.hit).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();

    const stats = cache.getStats();
    expect(stats.size).toBe(0);
  });
});
```

## Integration Testing

### Testing Factory Integration

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

describe('CacheFactory Integration', () => {
  it('should create working cache', () => {
    const cache = CacheFactory.create<string>();
    
    cache.set('key1', 'value1');
    const result = cache.get('key1');
    
    expect(result.hit).toBe(true);
    expect(result.value).toBe('value1');
  });

  it('should create high-performance cache', () => {
    const cache = CacheFactory.createHighPerformance<string>();
    
    expect(cache.getConfig().maxSize).toBe(100);
    expect(cache.getConfig().defaultTTL).toBe(30000);
  });
});
```

### Testing Configuration Builder Integration

```typescript
import { CacheConfigBuilder } from '../configuration/builders/CacheConfigBuilder';
import { CacheConfigValidator } from '../configuration/validators/CacheConfigValidator';

describe('Configuration Integration', () => {
  it('should build valid configuration', () => {
    const config = CacheConfigBuilder.create()
      .withMaxSize(1000)
      .withDefaultTTL(60000)
      .build();

    CacheConfigValidator.validate(config);
    expect(config.maxSize).toBe(1000);
  });

  it('should reject invalid configuration', () => {
    expect(() => {
      CacheConfigBuilder.create()
        .withMaxSize(-1)
        .build();
    }).toThrow();
  });
});
```

## Performance Testing

### Benchmarking Cache Operations

```typescript
describe('Cache Performance', () => {
  it('should handle high throughput', () => {
    const cache = new CacheManager<string>();
    const iterations = 10000;

    const start = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    
    const setDuration = Date.now() - start;
    expect(setDuration).toBeLessThan(1000); // < 1 second

    const getStart = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      cache.get(`key${i}`);
    }
    
    const getDuration = Date.now() - getStart;
    expect(getDuration).toBeLessThan(500); // < 0.5 seconds
  });

  it('should handle eviction efficiently', () => {
    const cache = new CacheManager<string>({ maxSize: 100 });
    
    for (let i = 0; i < 200; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    
    const stats = cache.getStats();
    expect(stats.size).toBe(100);
    expect(stats.evictions).toBeGreaterThan(0);
  });
});
```

### Memory Usage Testing

```typescript
describe('Cache Memory', () => {
  it('should not exceed memory limits', () => {
    const cache = new CacheManager<string>({ maxSize: 1000 });
    
    for (let i = 0; i < 10000; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    
    const stats = cache.getStats();
    expect(stats.size).toBe(1000);
  });
});
```

## Property-Based Testing

Using a property-based testing library like fast-check:

```typescript
import * as fc from 'fast-check';

describe('Cache Property Tests', () => {
  it('should preserve stored values', () => {
    fc.assert(
      fc.property(fc.string(), fc.anything(), (key, value) => {
        const cache = new CacheManager<any>();
        cache.set(key, value);
        const result = cache.get(key);
        return result.hit && result.value === value;
      })
    );
  });

  it('should handle deletion correctly', () => {
    fc.assert(
      fc.property(fc.string(), fc.anything(), (key, value) => {
        const cache = new CacheManager<any>();
        cache.set(key, value);
        cache.delete(key);
        const result = cache.get(key);
        return !result.hit;
      })
    );
  });
});
```

## Test Utilities

### Test Helpers

```typescript
export class CacheTestHelpers {
  static createTestCache<T>(config?: Partial<CacheConfigOptions>): CacheManager<T> {
    return new CacheManager<T>(config);
  }

  static fillCache<T>(cache: CacheManager<T>, count: number): void {
    for (let i = 0; i < count; i++) {
      cache.set(`key${i}`, `value${i}` as any);
    }
  }

  static waitForTTL(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static assertCacheStats(stats: CacheStats, expected: Partial<CacheStats>): void {
    if (expected.hits !== undefined) {
      expect(stats.hits).toBe(expected.hits);
    }
    if (expected.misses !== undefined) {
      expect(stats.misses).toBe(expected.misses);
    }
    if (expected.evictions !== undefined) {
      expect(stats.evictions).toBe(expected.evictions);
    }
    if (expected.size !== undefined) {
      expect(stats.size).toBe(expected.size);
    }
  }
}
```

## Test Coverage

Aim for:

- **Domain Layer**: 100% coverage
- **Configuration Layer**: 100% coverage
- **Strategies Layer**: 100% coverage
- **Statistics Layer**: 100% coverage
- **Storage Layer**: 100% coverage
- **Core Layer**: 90%+ coverage
- **Factories Layer**: 100% coverage
- **Utils Layer**: 100% coverage

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- CacheManager.test.ts

# Watch mode
npm test -- --watch
```

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm test
      - run: npm test -- --coverage
```

## Best Practices

1. **Test isolation**: Each test should be independent
2. **Clear naming**: Use descriptive test names
3. **AAA pattern**: Arrange, Act, Assert structure
4. **Mock external dependencies**: Use mocks for external services
5. **Test edge cases**: Test boundary conditions
6. **Test error cases**: Test error handling
7. **Keep tests fast**: Unit tests should run quickly
8. **Maintain test data**: Use fixtures for complex test data
