# Cache Layer Examples

## Overview

This document provides practical examples of using the Cache Layer in various scenarios.

## Basic Examples

### Simple Cache Usage

```typescript
import { CacheManager } from '../core/managers/CacheManager';

// Create cache instance
const cache = new CacheManager<string>();

// Store value
cache.set('user:1', 'John Doe', 60000); // 60 seconds TTL

// Retrieve value
const result = cache.get('user:1');
if (result.hit) {
  console.log('User:', result.value);
} else {
  console.log('Cache miss');
}

// Delete value
cache.delete('user:1');
```

### Using Factory

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

// Create high-performance cache
const cache = CacheFactory.createHighPerformance<string>();

// Create large cache
const largeCache = CacheFactory.createLargeCache<object>();

// Create with custom config
const customCache = CacheFactory.create<string>({
  maxSize: 500,
  defaultTTL: 30000,
});
```

### Configuration Builder

```typescript
import { CacheConfigBuilder } from '../configuration/builders/CacheConfigBuilder';

const config = CacheConfigBuilder.create()
  .withMaxSize(1000)
  .withDefaultTTLSeconds(60)
  .withInvalidationStrategy(InvalidationStrategy.LRU)
  .build();

const cache = new CacheManager<string>(config);
```

## Real-World Examples

### Web Application Caching

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

// Create cache for web application
const cache = CacheFactory.create<string>({
  maxSize: 1000,
  defaultTTL: 300000, // 5 minutes
});

async function getUserData(userId: string): Promise<UserData> {
  // Try cache first
  const cached = cache.get(`user:${userId}`);
  if (cached.hit) {
    return JSON.parse(cached.value);
  }

  // Fetch from database
  const userData = await database.getUser(userId);
  
  // Cache the result
  cache.set(`user:${userId}`, JSON.stringify(userData));
  
  return userData;
}

// Invalidate user data when updated
function updateUser(userId: string, data: UserData): void {
  database.updateUser(userId, data);
  cache.invalidate(`user:${userId}`);
}

// Invalidate all user cache
function invalidateAllUsers(): void {
  cache.invalidate('user:*');
}
```

### API Response Caching

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

const apiCache = CacheFactory.create<string>({
  maxSize: 500,
  defaultTTL: 600000, // 10 minutes
});

async function fetchAPI(endpoint: string): Promise<any> {
  const cacheKey = `api:${endpoint}`;
  
  // Check cache
  const cached = apiCache.get(cacheKey);
  if (cached.hit) {
    return JSON.parse(cached.value);
  }

  // Fetch from API
  const response = await fetch(endpoint);
  const data = await response.json();
  
  // Cache response
  apiCache.set(cacheKey, JSON.stringify(data));
  
  return data;
}

// Invalidate API cache when data changes
function invalidateAPI(endpoint: string): void {
  apiCache.delete(`api:${endpoint}`);
}
```

### Session Management

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

const sessionCache = CacheFactory.create<string>({
  maxSize: 10000,
  defaultTTL: 3600000, // 1 hour
});

function createSession(userId: string): string {
  const sessionId = generateSessionId();
  const sessionData = JSON.stringify({
    userId,
    createdAt: Date.now(),
  });
  
  sessionCache.set(`session:${sessionId}`, sessionData);
  return sessionId;
}

function getSession(sessionId: string): SessionData | null {
  const cached = sessionCache.get(`session:${sessionId}`);
  if (cached.hit) {
    return JSON.parse(cached.value);
  }
  return null;
}

function destroySession(sessionId: string): void {
  sessionCache.delete(`session:${sessionId}`);
}

// Clean up expired sessions periodically
setInterval(() => {
  const entries = sessionCache.getEntries();
  entries.forEach(entry => {
    if (entry.isExpired()) {
      sessionCache.delete(entry.key);
    }
  });
}, 300000); // Every 5 minutes
```

### Database Query Caching

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

const queryCache = CacheFactory.create<string>({
  maxSize: 2000,
  defaultTTL: 180000, // 3 minutes
});

async function executeQuery(query: string, params: any[]): Promise<any[]> {
  // Create cache key from query and params
  const cacheKey = `query:${hash(query + JSON.stringify(params))}`;
  
  // Check cache
  const cached = queryCache.get(cacheKey);
  if (cached.hit) {
    return JSON.parse(cached.value);
  }

  // Execute query
  const results = await database.query(query, params);
  
  // Cache results
  queryCache.set(cacheKey, JSON.stringify(results));
  
  return results;
}

// Invalidate query cache when data changes
function invalidateQueryCache(table: string): void {
  queryCache.invalidate(`query:*${table}*`);
}
```

### Image Processing Caching

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

const imageCache = CacheFactory.create<Buffer>({
  maxSize: 100,
  defaultTTL: 86400000, // 24 hours
});

async function processImage(imagePath: string): Promise<Buffer> {
  // Check cache
  const cached = imageCache.get(imagePath);
  if (cached.hit) {
    return cached.value;
  }

  // Process image
  const processed = await imageProcessor.process(imagePath);
  
  // Cache processed image
  imageCache.set(imagePath, processed);
  
  return processed;
}
```

## Advanced Examples

### Multi-Tier Caching

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

// L1 cache - small, fast
const l1Cache = CacheFactory.createHighPerformance<string>();

// L2 cache - medium
const l2Cache = CacheFactory.create<string>({
  maxSize: 1000,
  defaultTTL: 300000,
});

// L3 cache - large
const l3Cache = CacheFactory.createLargeCache<string>();

async function getWithMultiTier(key: string): Promise<string | null> {
  // Try L1 first
  let result = l1Cache.get(key);
  if (result.hit) return result.value;

  // Try L2
  result = l2Cache.get(key);
  if (result.hit) {
    // Promote to L1
    l1Cache.set(key, result.value);
    return result.value;
  }

  // Try L3
  result = l3Cache.get(key);
  if (result.hit) {
    // Promote to L2 and L1
    l2Cache.set(key, result.value);
    l1Cache.set(key, result.value);
    return result.value;
  }

  return null;
}
```

### Cache with Statistics Monitoring

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';
import { CacheMetrics } from '../statistics/metrics/CacheMetrics';

const cache = CacheFactory.create<string>(undefined, {
  useDetailedStats: true,
});

// Monitor cache performance
setInterval(() => {
  const stats = cache.getStats();
  const hitRate = CacheMetrics.calculateHitRate(stats);
  const efficiency = CacheMetrics.calculateEfficiency(stats);
  const summary = CacheMetrics.getPerformanceSummary(stats);

  console.log(`Hit Rate: ${(hitRate * 100).toFixed(2)}%`);
  console.log(`Efficiency: ${efficiency.toFixed(2)}/100`);
  console.log(`Performance: ${summary}`);

  // Adjust configuration based on performance
  if (hitRate < 0.5) {
    cache.setConfig({
      maxSize: cache.getConfig().maxSize * 2,
    });
  }
}, 60000); // Every minute
```

### Cache with Custom Strategy

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';
import { LRUEvictionStrategy } from '../strategies/eviction/LRUEvictionStrategy';

const customStrategy = new LRUEvictionStrategy<string>();

const cache = CacheFactory.create<string>({
  invalidationStrategy: InvalidationStrategy.LRU,
});
```

### Cache with Pattern-Based Invalidation

```typescript
import { CacheManager } from '../core/managers/CacheManager';

const cache = new CacheManager<string>();

// Cache user data
cache.set('user:1:name', 'John');
cache.set('user:1:email', 'john@example.com');
cache.set('user:2:name', 'Jane');
cache.set('user:2:email', 'jane@example.com');

// Invalidate all user:1 data
cache.invalidate('user:1:*');

// Only user:2 data remains
console.log(cache.get('user:2:name').hit); // true
console.log(cache.get('user:1:name').hit); // false
```

### Cache with Time-Based Expiration

```typescript
import { CacheConfigBuilder } from '../configuration/builders/CacheConfigBuilder';

const config = CacheConfigBuilder.create()
  .withDefaultTTLSeconds(60)
  .withInvalidationStrategy(InvalidationStrategy.TIME_BASED)
  .build();

const cache = new CacheManager<string>(config);

// Entries automatically expire after 60 seconds
cache.set('temp:data', 'value');

// After 60 seconds
setTimeout(() => {
  const result = cache.get('temp:data');
  console.log(result.hit); // false
}, 61000);
```

### Cache with Error Handling

```typescript
import { CacheManager } from '../core/managers/CacheManager';
import { CacheError, CacheKeyError } from '../utils/errors';

const cache = new CacheManager<string>();

async function safeCacheOperation(key: string, value: string) {
  try {
    cache.set(key, value);
    const result = cache.get(key);
    if (result.hit) {
      return result.value;
    }
    throw new Error('Cache miss after set');
  } catch (error) {
    if (error instanceof CacheKeyError) {
      console.error('Invalid key:', error.message);
    } else if (error instanceof CacheError) {
      console.error('Cache error:', error.message);
    } else {
      console.error('Unknown error:', error);
    }
    throw error;
  }
}
```

### Cache with Bulk Operations

```typescript
import { CacheManager } from '../core/managers/CacheManager';

const cache = new CacheManager<string>();

// Bulk set
function bulkSet(items: Record<string, string>): void {
  Object.entries(items).forEach(([key, value]) => {
    cache.set(key, value);
  });
}

// Bulk get
function bulkGet(keys: string[]): Record<string, string | null> {
  const results: Record<string, string | null> = {};
  
  keys.forEach(key => {
    const result = cache.get(key);
    results[key] = result.hit ? result.value : null;
  });
  
  return results;
}

// Bulk delete
function bulkDelete(keys: string[]): void {
  keys.forEach(key => {
    cache.delete(key);
  });
}

// Usage
bulkSet({
  'key1': 'value1',
  'key2': 'value2',
  'key3': 'value3',
});

const values = bulkGet(['key1', 'key2', 'key3']);
console.log(values);
```

### Cache with Namespace

```typescript
class NamespacedCache {
  private cache: CacheManager<string>;
  private namespace: string;

  constructor(namespace: string, cache: CacheManager<string>) {
    this.namespace = namespace;
    this.cache = cache;
  }

  private getKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  set(key: string, value: string, ttl?: number): void {
    this.cache.set(this.getKey(key), value, ttl);
  }

  get(key: string): CacheResult<string> {
    return this.cache.get(this.getKey(key));
  }

  delete(key: string): void {
    this.cache.delete(this.getKey(key));
  }

  clear(): void {
    this.cache.invalidate(`${this.namespace}:*`);
  }
}

// Usage
const userCache = new NamespacedCache('user', cache);
const productCache = new NamespacedCache('product', cache);

userCache.set('1', 'John');
productCache.set('1', 'Laptop');
```

## Integration Examples

### Express.js Integration

```typescript
import express from 'express';
import { CacheFactory } from '../factories/cache/CacheFactory';

const app = express();
const cache = CacheFactory.create<string>();

app.get('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  const cacheKey = `user:${userId}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached.hit) {
    return res.json(JSON.parse(cached.value));
  }

  // Fetch from database
  const user = await database.getUser(userId);
  
  // Cache response
  cache.set(cacheKey, JSON.stringify(user));
  
  res.json(user);
});

app.post('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  
  // Update user
  await database.updateUser(userId, req.body);
  
  // Invalidate cache
  cache.delete(`user:${userId}`);
  
  res.json({ success: true });
});
```

### React Integration

```typescript
import { useState, useEffect } from 'react';
import { CacheFactory } from '../factories/cache/CacheFactory';

const cache = CacheFactory.create<string>();

function useCachedData(key: string, fetcher: () => Promise<any>) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // Check cache
      const cached = cache.get(key);
      if (cached.hit) {
        setData(JSON.parse(cached.value));
        setLoading(false);
        return;
      }

      // Fetch data
      const result = await fetcher();
      
      // Cache result
      cache.set(key, JSON.stringify(result));
      
      setData(result);
      setLoading(false);
    }

    loadData();
  }, [key, fetcher]);

  return { data, loading };
}

// Usage
function UserProfile({ userId }: { userId: string }) {
  const { data, loading } = useCachedData(
    `user:${userId}`,
    () => fetch(`/api/users/${userId}`).then(r => r.json())
  );

  if (loading) return <div>Loading...</div>;
  return <div>{data.name}</div>;
}
```

## Performance Examples

### Cache Warming

```typescript
async function warmCache(): Promise<void> {
  const popularItems = await database.getPopularItems();
  
  popularItems.forEach(item => {
    cache.set(`item:${item.id}`, JSON.stringify(item));
  });
  
  console.log(`Warmed cache with ${popularItems.length} items`);
}
```

### Cache Prefetching

```typescript
async function prefetchRelatedData(userId: string): Promise<void> {
  const user = await getUser(userId);
  
  // Prefetch related data
  const [orders, preferences] = await Promise.all([
    getUserOrders(userId),
    getUserPreferences(userId),
  ]);
  
  // Cache related data
  cache.set(`user:${userId}:orders`, JSON.stringify(orders));
  cache.set(`user:${userId}:preferences`, JSON.stringify(preferences));
}
```

### Cache Refresh

```typescript
async function refreshCacheEntry(key: string): Promise<void> {
  const cached = cache.get(key);
  if (!cached.hit) return;

  // Fetch fresh data
  const freshData = await fetchData(key);
  
  // Update cache
  cache.set(key, JSON.stringify(freshData));
}
```

## Monitoring Examples

### Cache Health Check

```typescript
function checkCacheHealth(): HealthStatus {
  const stats = cache.getStats();
  const hitRate = stats.getHitRate();
  const size = stats.size;
  const maxSize = cache.getConfig().maxSize;

  if (hitRate < 0.3) {
    return { status: 'degraded', message: 'Low hit rate' };
  }

  if (size > maxSize * 0.9) {
    return { status: 'warning', message: 'Cache nearly full' };
  }

  return { status: 'healthy', message: 'Cache operating normally' };
}
```

### Cache Metrics Export

```typescript
function exportCacheMetrics(): CacheMetrics {
  const stats = cache.getStats();
  
  return {
    hits: stats.hits,
    misses: stats.misses,
    evictions: stats.evictions,
    size: stats.size,
    hitRate: stats.getHitRate(),
    missRate: stats.getMissRate(),
    timestamp: Date.now(),
  };
}
```

## Best Practice Examples

### Cache-Aside Pattern

```typescript
async function getData(key: string): Promise<any> {
  // Check cache
  const cached = cache.get(key);
  if (cached.hit) {
    return cached.value;
  }

  // Load from source
  const data = await loadFromSource(key);
  
  // Populate cache
  cache.set(key, data);
  
  return data;
}
```

### Write-Through Pattern

```typescript
async function saveData(key: string, data: any): Promise<void> {
  // Write to source
  await writeToSource(key, data);
  
  // Update cache
  cache.set(key, data);
}
```

### Write-Behind Pattern

```typescript
async function saveDataDelayed(key: string, data: any): Promise<void> {
  // Update cache immediately
  cache.set(key, data);
  
  // Write to source asynchronously
  queueWriteOperation(key, data);
}
```
