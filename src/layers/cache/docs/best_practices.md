# Cache Layer Best Practices

## Overview

This document outlines best practices for using the Cache Layer effectively and efficiently.

## General Principles

### 1. Choose the Right Cache Type

Select the appropriate cache configuration based on your use case:

```typescript
// High-performance, low-latency cache (L1)
const l1Cache = CacheFactory.createHighPerformance<string>();

// Medium cache (L2)
const l2Cache = CacheFactory.create<string>({
  maxSize: 1000,
  defaultTTL: 300000,
});

// Large cache (L3)
const l3Cache = CacheFactory.createLargeCache<string>();
```

**Guidelines:**
- Use high-performance for hot data
- Use large cache for cold data
- Use multi-tier for hierarchical caching

### 2. Set Appropriate TTL

Balance between data freshness and cache efficiency:

```typescript
// Too short - frequent misses
cache.set('key', value, 1000); // 1 second

// Too long - stale data
cache.set('key', value, 86400000); // 24 hours

// Just right
cache.set('key', value, 300000); // 5 minutes
```

**Guidelines:**
- Static content: 1-24 hours
- Dynamic content: 1-10 minutes
- Session data: 30-60 minutes
- Real-time data: < 1 minute or no caching

### 3. Choose the Right Eviction Strategy

Match strategy to access patterns:

```typescript
// Temporal locality - data accessed recently likely to be accessed again
const lruCache = CacheFactory.create<string>({
  invalidationStrategy: InvalidationStrategy.LRU,
});

// Frequency-based - popular data should stay in cache
const lfuCache = CacheFactory.create<string>({
  invalidationStrategy: InvalidationStrategy.LFU,
});

// Simple scenarios - predictable eviction
const fifoCache = CacheFactory.create<string>({
  invalidationStrategy: InvalidationStrategy.MANUAL, // Uses FIFO
});
```

**Guidelines:**
- LRU: Web pages, API responses, database queries
- LFU: Popular content, static assets, configuration
- FIFO: Log buffers, message queues, simple caching

### 4. Use Namespaces

Organize cache keys with namespaces for better management:

```typescript
// Good - namespaced
cache.set('user:123:name', 'John');
cache.set('user:123:email', 'john@example.com');
cache.set('product:456:name', 'Laptop');

// Bad - flat
cache.set('123_name', 'John');
cache.set('123_email', 'john@example.com');
cache.set('456_name', 'Laptop');
```

**Benefits:**
- Easy invalidation by pattern
- Clear key structure
- Avoids key collisions

### 5. Handle Cache Misses Gracefully

Always check for cache hits before using values:

```typescript
// Good - check hit
const result = cache.get(key);
if (result.hit) {
  console.log(result.value);
} else {
  // Handle miss
  const data = await fetchData(key);
  cache.set(key, data);
}

// Bad - assume hit
const result = cache.get(key);
console.log(result.value); // May be undefined
```

### 6. Monitor Cache Performance

Regularly monitor cache statistics:

```typescript
setInterval(() => {
  const stats = cache.getStats();
  const hitRate = stats.getHitRate();
  
  console.log(`Hit rate: ${(hitRate * 100).toFixed(2)}%`);
  
  if (hitRate < 0.5) {
    console.warn('Low hit rate - consider adjusting configuration');
  }
}, 60000);
```

## Configuration Best Practices

### Use Factory Methods

Always use factory methods instead of direct instantiation:

```typescript
// Good - use factory
const cache = CacheFactory.create<string>();

// Bad - direct instantiation
const cache = new CacheManager<string>();
```

### Use Configuration Builders

Use builders for complex configurations:

```typescript
// Good - builder pattern
const config = CacheConfigBuilder.create()
  .withMaxSize(1000)
  .withDefaultTTLSeconds(60)
  .withInvalidationStrategy(InvalidationStrategy.LRU)
  .build();

const cache = new CacheManager<string>(config);

// Bad - manual object creation
const cache = new CacheManager<string>({
  maxSize: 1000,
  defaultTTL: 60000,
  invalidationStrategy: InvalidationStrategy.LRU,
  enableMultiLevel: false,
});
```

### Validate Configuration

Always validate configuration before use:

```typescript
try {
  CacheConfigValidator.validate(config);
  const cache = new CacheManager<string>(config);
} catch (error) {
  console.error('Invalid configuration:', error.message);
  // Use default configuration
  const cache = new CacheManager<string>();
}
```

### Use Environment-Specific Configuration

Adjust configuration based on environment:

```typescript
const config = process.env.NODE_ENV === 'production'
  ? DefaultConfigs.LARGE_CACHE
  : DefaultConfigs.HIGH_PERFORMANCE;

const cache = new CacheManager<string>(config);
```

## Key Management Best Practices

### Use Consistent Key Formats

Maintain consistent key naming conventions:

```typescript
// Good - consistent format
cache.set('user:123:profile', userData);
cache.set('user:123:settings', userSettings);
cache.set('product:456:details', productDetails);

// Bad - inconsistent
cache.set('user_123_profile', userData);
cache.set('user-123-settings', userSettings);
cache.set('product456', productDetails);
```

### Sanitize User Input

Always sanitize user-provided keys:

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

function setUserData(userId: string, data: any): void {
  const sanitizedKey = CacheHelper.sanitizeKey(`user:${userId}`);
  cache.set(sanitizedKey, JSON.stringify(data));
}
```

### Use Versioned Keys

Include version in keys for cache invalidation:

```typescript
const CACHE_VERSION = 'v1';

cache.set(`${CACHE_VERSION}:user:123`, userData);

// When data structure changes, increment version
const CACHE_VERSION = 'v2';
```

## Invalidation Best Practices

### Use Pattern-Based Invalidation

Group related keys for efficient invalidation:

```typescript
// Cache user data
cache.set('user:123:profile', profile);
cache.set('user:123:settings', settings);
cache.set('user:123:preferences', preferences);

// Invalidate all user data at once
cache.invalidate('user:123:*');
```

### Invalidate on Data Changes

Always invalidate cache when underlying data changes:

```typescript
async function updateUser(userId: string, data: UserData): Promise<void> {
  await database.updateUser(userId, data);
  cache.invalidate(`user:${userId}:*`);
}
```

### Use Time-Based Invalidation

Let time-based invalidation handle expiration:

```typescript
const config = CacheConfigBuilder.create()
  .withInvalidationStrategy(InvalidationStrategy.TIME_BASED)
  .withDefaultTTLMinutes(10)
  .build();
```

## Memory Management Best Practices

### Set Appropriate Cache Size

Configure cache size based on available memory:

```typescript
// Calculate based on available memory
const availableMemory = os.totalmem() * 0.1; // Use 10% of memory
const avgEntrySize = 1000; // Estimated average entry size
const maxSize = Math.floor(availableMemory / avgEntrySize);

const cache = new CacheManager<string>({ maxSize });
```

### Monitor Memory Usage

Regularly check cache memory usage:

```typescript
setInterval(() => {
  const stats = cache.getStats();
  const maxSize = cache.getConfig().maxSize;
  const usage = (stats.size / maxSize) * 100;
  
  if (usage > 90) {
    console.warn(`Cache ${usage.toFixed(2)}% full`);
  }
}, 60000);
```

### Use Multi-Tier Caching

Use multiple cache tiers for better memory efficiency:

```typescript
const l1Cache = CacheFactory.createHighPerformance<string>(); // Hot data
const l2Cache = CacheFactory.create<string>({ maxSize: 1000 }); // Warm data
const l3Cache = CacheFactory.createLargeCache<string>(); // Cold data
```

## Performance Best Practices

### Cache Hot Data

Identify and cache frequently accessed data:

```typescript
async function warmCache(): Promise<void> {
  const hotData = await database.getHotData();
  hotData.forEach(item => {
    cache.set(`hot:${item.id}`, JSON.stringify(item));
  });
}
```

### Use Bulk Operations

Perform operations in bulk when possible:

```typescript
// Good - bulk
const items = ['key1', 'key2', 'key3'];
const results = items.map(key => cache.get(key));

// Bad - individual
const result1 = cache.get('key1');
const result2 = cache.get('key2');
const result3 = cache.get('key3');
```

### Prefetch Related Data

Load related data proactively:

```typescript
async function loadUserWithRelated(userId: string): Promise<void> {
  const user = await getUser(userId);
  cache.set(`user:${userId}`, JSON.stringify(user));
  
  // Prefetch related data
  const [orders, preferences] = await Promise.all([
    getUserOrders(userId),
    getUserPreferences(userId),
  ]);
  
  cache.set(`user:${userId}:orders`, JSON.stringify(orders));
  cache.set(`user:${userId}:preferences`, JSON.stringify(preferences));
}
```

## Error Handling Best Practices

### Use Specific Error Types

Catch and handle specific error types:

```typescript
try {
  cache.set(key, value);
} catch (error) {
  if (error instanceof CacheKeyError) {
    console.error('Invalid key:', error.message);
  } else if (error instanceof CacheConfigError) {
    console.error('Invalid config:', error.message);
  } else if (error instanceof CacheStorageError) {
    console.error('Storage error:', error.message);
  }
}
```

### Implement Fallback Mechanisms

Provide fallback when cache fails:

```typescript
async function getDataWithFallback(key: string): Promise<any> {
  try {
    const cached = cache.get(key);
    if (cached.hit) {
      return cached.value;
    }
  } catch (error) {
    console.error('Cache error, using fallback:', error);
  }
  
  // Fallback to direct fetch
  return await fetchData(key);
}
```

### Log Errors Appropriately

Log cache errors for debugging:

```typescript
try {
  cache.set(key, value);
} catch (error) {
  logger.error('Cache operation failed', {
    key,
    error: error.message,
    stack: error.stack,
  });
  throw error;
}
```

## Testing Best Practices

### Test Cache Behavior

Test cache operations thoroughly:

```typescript
describe('Cache Operations', () => {
  it('should store and retrieve values', () => {
    cache.set('key', 'value');
    const result = cache.get('key');
    expect(result.hit).toBe(true);
    expect(result.value).toBe('value');
  });

  it('should expire entries after TTL', async () => {
    cache.set('key', 'value', 100);
    await sleep(150);
    const result = cache.get('key');
    expect(result.hit).toBe(false);
  });
});
```

### Test Cache Invalidation

Test invalidation patterns:

```typescript
it('should invalidate by pattern', () => {
  cache.set('user:1:name', 'John');
  cache.set('user:2:name', 'Jane');
  cache.invalidate('user:1:*');
  
  expect(cache.get('user:1:name').hit).toBe(false);
  expect(cache.get('user:2:name').hit).toBe(true);
});
```

### Test Error Scenarios

Test error handling:

```typescript
it('should handle invalid keys', () => {
  expect(() => {
    cache.set('', 'value');
  }).toThrow(CacheKeyError);
});
```

## Security Best Practices

### Sanitize All Input

Always sanitize user-provided input:

```typescript
function setUserCache(userId: string, data: any): void {
  const sanitizedId = CacheHelper.sanitizeKey(userId);
  cache.set(`user:${sanitizedId}`, JSON.stringify(data));
}
```

### Validate Cache Keys

Validate cache keys before use:

```typescript
function validateKey(key: string): boolean {
  try {
    CacheValidationService.validateKey(key);
    return true;
  } catch {
    return false;
  }
}
```

### Avoid Caching Sensitive Data

Don't cache sensitive information:

```typescript
// Bad - caching passwords
cache.set('user:123:password', password);

// Good - caching non-sensitive data
cache.set('user:123:profile', userProfile);
```

## Monitoring Best Practices

### Track Key Metrics

Monitor important cache metrics:

```typescript
function reportMetrics(): void {
  const stats = cache.getStats();
  
  metrics.gauge('cache.hits', stats.hits);
  metrics.gauge('cache.misses', stats.misses);
  metrics.gauge('cache.size', stats.size);
  metrics.gauge('cache.hit_rate', stats.getHitRate());
}
```

### Set Up Alerts

Configure alerts for cache issues:

```typescript
function checkCacheHealth(): void {
  const stats = cache.getStats();
  const hitRate = stats.getHitRate();
  
  if (hitRate < 0.3) {
    alert('Low cache hit rate', { hitRate });
  }
}
```

### Export Metrics for Analysis

Export metrics for external analysis:

```typescript
function exportMetrics(): object {
  const stats = cache.getStats();
  
  return {
    timestamp: Date.now(),
    hits: stats.hits,
    misses: stats.misses,
    evictions: stats.evictions,
    size: stats.size,
    hitRate: stats.getHitRate(),
  };
}
```

## Anti-Patterns

### Don't Cache Everything

Avoid caching all data indiscriminately:

```typescript
// Bad - caching everything
async function handleRequest(key: string): Promise<any> {
  const cached = cache.get(key);
  if (cached.hit) return cached.value;
  
  const data = await fetchData(key);
  cache.set(key, data);
  return data;
}

// Good - selective caching
async function handleRequest(key: string): Promise<any> {
  if (!shouldCache(key)) {
    return await fetchData(key);
  }
  
  const cached = cache.get(key);
  if (cached.hit) return cached.value;
  
  const data = await fetchData(key);
  cache.set(key, data);
  return data;
}
```

### Don't Use Too Long TTL

Avoid excessively long TTL values:

```typescript
// Bad - 24 hours for dynamic data
cache.set('user:123', userData, 86400000);

// Good - 5 minutes for dynamic data
cache.set('user:123', userData, 300000);
```

### Don't Ignore Cache Errors

Never ignore cache errors silently:

```typescript
// Bad - silent error
try {
  cache.set(key, value);
} catch (error) {
  // Ignore
}

// Good - handle error
try {
  cache.set(key, value);
} catch (error) {
  logger.error('Cache error:', error);
  throw error;
}
```

### Don't Cache Large Objects

Avoid caching very large objects:

```typescript
// Bad - caching large response
cache.set('api:large-response', largeResponse);

// Good - cache smaller, relevant data
cache.set('api:response:summary', response.summary);
```

## Checklist

Use this checklist when implementing caching:

- [ ] Choose appropriate cache type (L1, L2, L3)
- [ ] Set appropriate TTL based on data freshness requirements
- [ ] Select eviction strategy based on access patterns
- [ ] Use consistent key naming conventions
- [ ] Implement namespace-based key organization
- [ ] Handle cache misses gracefully
- [ ] Monitor cache performance regularly
- [ ] Set up alerts for cache issues
- [ ] Validate configuration before use
- [ ] Sanitize user input for keys
- [ ] Implement error handling and fallbacks
- [ ] Test cache behavior thoroughly
- [ ] Avoid caching sensitive data
- [ ] Don't cache everything indiscriminately
- [ ] Document cache usage and configuration
