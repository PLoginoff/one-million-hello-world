# Core Layer Documentation

## Overview

The Core Layer contains the main cache logic that orchestrates all other layers. It provides high-level cache operations while delegating specific concerns to specialized layers (storage, strategies, statistics, etc.).

## Structure

```
core/
├── services/           # Core cache services
│   ├── CacheService.ts
│   └── index.ts
├── managers/          # Cache managers (orchestrators)
│   ├── CacheManager.ts
│   └── index.ts
└── index.ts
```

## CacheService

The CacheService is the core service that implements cache operations using layered architecture.

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

#### get(key: string): CacheResult<T>

Retrieves a value from cache with automatic invalidation and access tracking.

```typescript
const result = cacheService.get('user:1');
if (result.hit) {
  console.log(result.value); // Cached value
  console.log(result.fromLevel); // Cache level (L1, L2, L3)
} else {
  console.log('Cache miss');
}
```

**Process:**
1. Check storage for entry
2. If not found → record miss, return miss
3. If found → check invalidation strategy
4. If invalid → delete, record miss, return miss
5. If valid → record access, update eviction strategy, record hit, return value

#### set(key: string, value: T, ttl?: number): void

Stores a value in cache with optional TTL.

```typescript
// Use default TTL from config
cacheService.set('user:1', userData);

// Use custom TTL (60 seconds)
cacheService.set('user:1', userData, 60000);
```

**Process:**
1. Create cache entry with TTL
2. Check if size limit reached
3. If full → trigger eviction
4. Store entry
5. Notify eviction strategy of addition
6. Update statistics

#### delete(key: string): boolean

Removes a specific entry from cache.

```typescript
const deleted = cacheService.delete('user:1');
if (deleted) {
  console.log('Entry deleted');
} else {
  console.log('Entry not found');
}
```

#### clear(): void

Removes all entries from cache.

```typescript
cacheService.clear();
console.log('Cache cleared');
```

#### invalidate(pattern: string): void

Removes all entries matching a regex pattern.

```typescript
// Invalidate all user cache
cacheService.invalidate('user:*');

// Invalidate all product cache
cacheService.invalidate('product:*');

// Invalidate all cache
cacheService.invalidate('.*');
```

#### getStats(): CacheStats

Returns current cache statistics.

```typescript
const stats = cacheService.getStats();
console.log(`Hits: ${stats.hits}`);
console.log(`Misses: ${stats.misses}`);
console.log(`Hit rate: ${(stats.getHitRate() * 100).toFixed(2)}%`);
```

#### updateConfig(config: Partial<CacheConfigOptions>): void

Updates cache configuration at runtime.

```typescript
cacheService.updateConfig({
  maxSize: 2000,
  defaultTTL: 90000,
});
```

#### getConfig(): CacheConfigOptions

Returns current configuration.

```typescript
const config = cacheService.getConfig();
console.log(`Max size: ${config.maxSize}`);
console.log(`Default TTL: ${config.defaultTTL}`);
```

#### getEntries(): CacheEntry<T>[]

Returns all cache entries.

```typescript
const entries = cacheService.getEntries();
entries.forEach(entry => {
  console.log(`${entry.key}: ${entry.value}`);
});
```

## CacheManager

The CacheManager is the main public interface for cache operations. It wraps CacheService with a simpler API.

### Constructor

```typescript
constructor(config?: Partial<CacheConfigOptions>)
```

### Usage

```typescript
import { CacheManager } from '../core/managers/CacheManager';

// Create with default configuration
const cache = new CacheManager<string>();

// Create with custom configuration
const cache = new CacheManager<string>({
  maxSize: 500,
  defaultTTL: 30000,
  invalidationStrategy: InvalidationStrategy.LFU,
});
```

### Methods

CacheManager provides the same methods as CacheService but with a simpler API:

- `get(key: string): CacheResult<T>`
- `set(key: string, value: T, ttl?: number): void`
- `delete(key: string): void`
- `clear(): void`
- `invalidate(pattern: string): void`
- `getStats(): CacheStats`
- `setConfig(config: Partial<CacheConfigOptions>): void`
- `getConfig(): CacheConfigOptions`
- `getEntries(): CacheEntry<T>[]`

## Architecture Flow

### Read Operation Flow

```
CacheManager.get(key)
    ↓
CacheService.get(key)
    ↓
Storage.get(key)
    ↓
InvalidationStrategy.shouldInvalidate(entry)
    ↓
[if invalid] → Storage.delete(key) → Stats.recordMiss() → Return miss
[if valid] → Entry.recordAccess() → EvictionStrategy.onAccess() → Stats.recordHit() → Return value
```

### Write Operation Flow

```
CacheManager.set(key, value, ttl)
    ↓
CacheService.set(key, value, ttl)
    ↓
[if size >= maxSize] → EvictionStrategy.selectEntryToEvict() → Storage.delete(key) → Stats.recordEviction()
    ↓
Create CacheEntry
    ↓
Storage.set(key, entry)
    ↓
EvictionStrategy.onAdd(key, entry)
    ↓
Stats.updateSize()
```

### Eviction Flow

```
Cache size check
    ↓
[if size >= maxSize]
    ↓
EvictionStrategy.selectEntryToEvict(entries)
    ↓
Storage.delete(selectedKey)
    ↓
Stats.recordEviction()
```

## Usage Examples

### Basic Cache Operations

```typescript
import { CacheManager } from '../core/managers/CacheManager';

const cache = new CacheManager<string>();

// Store value
cache.set('user:1', 'John Doe', 60000);

// Retrieve value
const result = cache.get('user:1');
if (result.hit) {
  console.log(`User: ${result.value}`);
}

// Delete value
cache.delete('user:1');

// Clear all
cache.clear();
```

### Pattern-Based Invalidation

```typescript
// Cache multiple users
cache.set('user:1', user1);
cache.set('user:2', user2);
cache.set('user:3', user3);

// Invalidate all users at once
cache.invalidate('user:*');

// All user entries are now deleted
```

### Monitoring Cache Performance

```typescript
// Perform operations
cache.set('key1', 'value1');
cache.get('key1');
cache.get('nonexistent');

// Get statistics
const stats = cache.getStats();
console.log(`Hit rate: ${(stats.getHitRate() * 100).toFixed(2)}%`);
console.log(`Miss rate: ${(stats.getMissRate() * 100).toFixed(2)}%`);
console.log(`Evictions: ${stats.evictions}`);
console.log(`Size: ${stats.size}`);
```

### Runtime Configuration Updates

```typescript
// Start with default config
const cache = new CacheManager<string>();

// Update configuration based on performance
const stats = cache.getStats();
if (stats.getHitRate() < 0.5) {
  cache.setConfig({
    maxSize: cache.getConfig().maxSize * 2,
    defaultTTL: cache.getConfig().defaultTTL * 2,
  });
}
```

## Integration Examples

### With Custom Storage

```typescript
import { CacheService } from '../core/services/CacheService';
import { CustomStorage } from './CustomStorage';

const storage = new CustomStorage<string>();
const evictionStrategy = new LRUEvictionStrategy<string>();
const invalidationStrategy = new TimeBasedInvalidationStrategy<string>();
const statsCollector = new BasicStatisticsCollector();
const config = DefaultConfigs.DEFAULT;

const cacheService = new CacheService(
  storage,
  evictionStrategy,
  invalidationStrategy,
  statsCollector,
  config
);
```

### With Custom Statistics

```typescript
import { DetailedStatisticsCollector } from '../statistics/collectors/DetailedStatisticsCollector';

const statsCollector = new DetailedStatisticsCollector();
const cache = new CacheManager<string>(config);

// Get detailed statistics
const detailedStats = statsCollector.getDetailedStats();
console.log(`Peak size: ${detailedStats.peakSize}`);
console.log(`Last hit: ${new Date(detailedStats.lastHitTime).toISOString()}`);
```

## Error Handling

The Core Layer handles errors gracefully:

```typescript
try {
  cache.set('key', 'value');
} catch (error) {
  if (error instanceof CacheConfigError) {
    console.error('Configuration error:', error.message);
  } else if (error instanceof CacheStorageError) {
    console.error('Storage error:', error.message);
  }
}
```

## Performance Considerations

### Operation Complexity

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| get() | O(1) | Storage lookup + validation |
| set() | O(1) avg, O(n) worst | May trigger eviction |
| delete() | O(1) | Direct storage deletion |
| clear() | O(n) | Must clear all entries |
| invalidate() | O(n) | Pattern matching on all keys |
| getStats() | O(1) | Returns cached stats |

### Memory Usage

- **Base overhead**: ~1KB per cache instance
- **Per entry**: Depends on value size + metadata (~100 bytes)
- **Strategy overhead**: Varies by strategy (LRU/LFU: O(n), FIFO: O(n), Random: O(0))

## Best Practices

1. **Use appropriate TTL**: Balance freshness and performance
2. **Monitor hit rates**: Adjust configuration based on performance
3. **Use pattern invalidation**: Group related keys for efficient invalidation
4. **Handle misses gracefully**: Always check `result.hit` before using value
5. **Size appropriately**: Set maxSize based on available memory
6. **Choose right strategy**: Match eviction strategy to access patterns
7. **Monitor statistics**: Regularly review cache performance metrics
8. **Test with realistic data**: Validate configuration with production-like data

## Testing Core Layer

```typescript
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
});
```

## Advanced Patterns

### Cache-Aside Pattern

```typescript
function getUser(userId: string): User {
  // Try cache first
  const cached = cache.get(`user:${userId}`);
  if (cached.hit) {
    return cached.value;
  }

  // Cache miss - fetch from database
  const user = database.getUser(userId);
  
  // Store in cache
  cache.set(`user:${userId}`, user, 300000); // 5 minutes
  
  return user;
}
```

### Write-Through Pattern

```typescript
function updateUser(user: User): void {
  // Update database
  database.updateUser(user);
  
  // Update cache
  cache.set(`user:${user.id}`, user, 300000);
}
```

### Write-Behind Pattern

```typescript
function updateUser(user: User): void {
  // Update cache immediately
  cache.set(`user:${user.id}`, user, 300000);
  
  // Update database asynchronously
  queueDatabaseUpdate(user);
}
```

## Troubleshooting

### Low Hit Rate

**Symptoms**: Hit rate < 50%

**Solutions**:
- Increase cache size
- Increase TTL
- Change eviction strategy
- Analyze access patterns

### High Memory Usage

**Symptoms**: Cache size approaching maxSize

**Solutions**:
- Reduce maxSize
- Reduce TTL
- Use more aggressive eviction strategy
- Implement multi-tier caching

### Stale Data

**Symptoms**: Cached data is outdated

**Solutions**:
- Reduce TTL
- Implement manual invalidation
- Use time-based invalidation strategy
- Implement cache refresh logic
