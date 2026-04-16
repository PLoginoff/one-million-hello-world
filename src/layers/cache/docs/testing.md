# Testing Strategy

## Overview
The Cache Layer follows a comprehensive testing strategy to ensure correctness, performance, and reliability of caching functionality. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **ICacheManager Interface**: 100% (type validation)
- **CacheManager Implementation**: 99%+
- **L1 Cache**: 99%+
- **Multi-Level Cache Manager**: 99%+
- **Eviction Strategies**: 99%+
- **Statistics Tracker**: 99%+

## Unit Tests

### Test Organization
```
src/layers/cache/__tests__/
├── unit/
│   ├── cache/
│   │   ├── l1-cache.test.ts
│   │   ├── multi-level-cache.test.ts
│   │   └── cache-manager.test.ts
│   ├── eviction/
│   │   ├── lru-eviction.test.ts
│   │   ├── lfu-eviction.test.ts
│   │   └── eviction-strategy.test.ts
│   ├── invalidation/
│   │   ├── ttl-manager.test.ts
│   │   ├── pattern-invalidator.test.ts
│   │   └── manual-invalidator.test.ts
│   └── statistics/
│       ├── statistics-tracker.test.ts
│       ├── performance-monitor.test.ts
│       └── statistics-aggregator.test.ts
```

### Unit Test Categories

#### 1. L1 Cache Tests
```typescript
describe('L1 Cache', () => {
  it('should set and get value', () => {
    const cache = new L1Cache(100, new LRUEvictionStrategy());
    cache.set('key1', 'value1', 300);
    
    const result = cache.get('key1');
    expect(result).not.toBeNull();
    expect(result?.value).toBe('value1');
  });

  it('should return null for non-existent key', () => {
    const cache = new L1Cache(100, new LRUEvictionStrategy());
    
    const result = cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should evict entries when cache is full', () => {
    const cache = new L1Cache(2, new LRUEvictionStrategy());
    cache.set('key1', 'value1', 300);
    cache.set('key2', 'value2', 300);
    cache.set('key3', 'value3', 300);
    
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).not.toBeNull();
  });

  it('should delete entry', () => {
    const cache = new L1Cache(100, new LRUEvictionStrategy());
    cache.set('key1', 'value1', 300);
    cache.delete('key1');
    
    expect(cache.get('key1')).toBeNull();
  });
});
```

#### 2. Multi-Level Cache Tests
```typescript
describe('Multi-Level Cache', () => {
  it('should get from L1 when available', async () => {
    const config = createCacheConfig({ multiLevelEnabled: true });
    const manager = new MultiLevelCacheManager(config);
    
    await manager.set('key1', 'value1', 300);
    const result = await manager.get('key1');
    
    expect(result).not.toBeNull();
    expect(result?.level).toBe(CacheLevel.L1);
  });

  it('should promote from L2 to L1', async () => {
    const config = createCacheConfig({ multiLevelEnabled: true });
    const manager = new MultiLevelCacheManager(config);
    
    // Set only in L2
    manager.l2.set('key1', 'value1', 600);
    
    const result = await manager.get('key1');
    
    expect(result).not.toBeNull();
    expect(result?.level).toBe(CacheLevel.L1);
    expect(manager.l1.get('key1')).not.toBeNull();
  });

  it('should delete from all levels', async () => {
    const config = createCacheConfig({ multiLevelEnabled: true });
    const manager = new MultiLevelCacheManager(config);
    
    await manager.set('key1', 'value1', 300);
    await manager.delete('key1');
    
    expect(manager.l1.get('key1')).toBeNull();
    expect(manager.l2.get('key1')).toBeNull();
    expect(manager.l3.get('key1')).toBeNull();
  });
});
```

#### 3. Eviction Strategy Tests
```typescript
describe('LRU Eviction Strategy', () => {
  it('should evict least recently used entries', () => {
    const cache = new Map<string, CacheEntry>();
    const strategy = new LRUEvictionStrategy();
    
    cache.set('key1', createEntry('key1', 1));
    cache.set('key2', createEntry('key2', 2));
    cache.set('key3', createEntry('key3', 3));
    
    const evicted = strategy.selectForEviction(cache);
    
    expect(evicted).toContain('key1');
  });
});

describe('LFU Eviction Strategy', () => {
  it('should evict least frequently used entries', () => {
    const cache = new Map<string, CacheEntry>();
    const strategy = new LFUEvictionStrategy();
    
    cache.set('key1', createEntry('key1', 1));
    cache.set('key2', createEntry('key2', 10));
    cache.set('key3', createEntry('key3', 5));
    
    const evicted = strategy.selectForEviction(cache);
    
    expect(evicted).toContain('key1');
  });
});
```

#### 4. Statistics Tracker Tests
```typescript
describe('Statistics Tracker', () => {
  it('should record hits', () => {
    const tracker = new CacheStatisticsTracker();
    
    tracker.recordHit(CacheLevel.L1, 10);
    
    const stats = tracker.getStatistics(CacheLevel.L1);
    expect(stats.hits).toBe(1);
    expect(stats.hitRate).toBe(1);
  });

  it('should record misses', () => {
    const tracker = new CacheStatisticsTracker();
    
    tracker.recordMiss(CacheLevel.L1);
    
    const stats = tracker.getStatistics(CacheLevel.L1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0);
  });

  it('should calculate hit rate correctly', () => {
    const tracker = new CacheStatisticsTracker();
    
    tracker.recordHit(CacheLevel.L1, 10);
    tracker.recordHit(CacheLevel.L1, 10);
    tracker.recordMiss(CacheLevel.L1);
    
    const stats = tracker.getStatistics(CacheLevel.L1);
    expect(stats.hitRate).toBeCloseTo(0.67, 2);
  });
});
```

## Integration Tests

### Full Cache Integration Tests
```typescript
describe('Cache Integration', () => {
  it('should handle complete cache lifecycle', async () => {
    const config = createCacheConfig({ multiLevelEnabled: true });
    const manager = new MultiLevelCacheManager(config);
    
    await manager.set('key1', 'value1', 300);
    const result = await manager.get('key1');
    
    expect(result?.value).toBe('value1');
    
    await manager.delete('key1');
    const deleted = await manager.get('key1');
    
    expect(deleted).toBeNull();
  });

  it('should track statistics across levels', async () => {
    const config = createCacheConfig({ multiLevelEnabled: true });
    const manager = new MultiLevelCacheManager(config);
    
    await manager.set('key1', 'value1', 300);
    await manager.get('key1');
    await manager.get('key2');
    
    const stats = manager.statisticsTracker.getAllStatistics();
    
    expect(stats.L1.hits).toBeGreaterThan(0);
    expect(stats.L1.misses).toBeGreaterThan(0);
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should set values within time limit', async () => {
    const cache = new L1Cache(1000, new LRUEvictionStrategy());
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      cache.set(`key${i}`, `value${i}`, 300);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 1000 sets
  });

  it('should get values within time limit', () => {
    const cache = new L1Cache(1000, new LRUEvictionStrategy());
    
    for (let i = 0; i < 1000; i++) {
      cache.set(`key${i}`, `value${i}`, 300);
    }
    
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      cache.get(`key${i}`);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(50); // < 50ms for 1000 gets
  });

  it('should handle concurrent access efficiently', async () => {
    const config = createCacheConfig({ multiLevelEnabled: true });
    const manager = new MultiLevelCacheManager(config);
    
    const start = Date.now();
    
    const promises = Array(100).fill(null).map((_, i) =>
      manager.set(`key${i}`, `value${i}`, 300)
    );
    
    await Promise.all(promises);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500); // < 500ms for 100 concurrent sets
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createCacheConfig(overrides?: Partial<CacheConfig>): CacheConfig {
  return {
    multiLevelEnabled: true,
    l1MaxSize: 100,
    l2MaxSize: 500,
    l3MaxSize: 1000,
    l1EvictionStrategy: new LRUEvictionStrategy(),
    l2EvictionStrategy: new LRUEvictionStrategy(),
    l3EvictionStrategy: new LRUEvictionStrategy(),
    defaultTTL: 300,
    ...overrides
  };
}

function createEntry(key: string, accessCount: number): CacheEntry {
  return {
    key,
    value: 'value',
    level: CacheLevel.L1,
    ttl: 300,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 300000),
    accessCount,
    lastAccessedAt: new Date()
  };
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/cache
```

### Integration Tests
```bash
npm run test:integration -- src/layers/cache
```

### Performance Tests
```bash
npm run test:performance -- src/layers/cache
```

### All Tests
```bash
npm test -- src/layers/cache
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/cache
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Cache Tests

on:
  pull_request:
    paths:
      - 'src/layers/cache/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/cache
      - run: npm run test:integration -- src/layers/cache
      - run: npm run test:performance -- src/layers/cache
      - run: npm run test:coverage -- src/layers/cache
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all cache operations
- Test eviction strategies
- Test TTL expiration
- Test multi-level caching
- Test statistics tracking
- Maintain test independence

### Performance Testing Guidelines
- Test with large datasets
- Test concurrent access
- Test eviction performance
- Monitor memory usage
- Test cache hit rates

### Statistics Testing Guidelines
- Test hit/miss counting
- Test eviction counting
- Test size tracking
- Test hit rate calculation
- Test aggregation
