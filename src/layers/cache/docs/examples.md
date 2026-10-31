# Cache Layer Examples

## Overview

Practical examples of using the Cache Layer. Core API: `CacheManager` (`set(key, value, ttl?)`, `get(key) → {hit, value}`, `delete`, `invalidate(pattern)`, `getStats()`, `setConfig()`, `getEntries()`), `CacheFactory` presets, and `CacheConfigBuilder`.

## Basic Examples

### Simple Cache Usage

```typescript
import { CacheManager } from '../core/managers/CacheManager';

const cache = new CacheManager<string>();
cache.set('user:1', 'John Doe', 60000); // 60s TTL

const result = cache.get('user:1');
if (result.hit) {
  console.log('User:', result.value);
}

cache.delete('user:1');
```

### Using the Factory

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

const cache = CacheFactory.createHighPerformance<string>();      // L1 preset
const largeCache = CacheFactory.createLargeCache<object>();      // L3 preset
const custom = CacheFactory.create<string>({ maxSize: 500, defaultTTL: 30000 });
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

### Web Application Caching (Cache-Aside)

```typescript
const cache = CacheFactory.create<string>({ maxSize: 1000, defaultTTL: 300000 });

async function getUserData(userId: string): Promise<UserData> {
  const cached = cache.get(`user:${userId}`);
  if (cached.hit) return JSON.parse(cached.value);

  const userData = await database.getUser(userId);
  cache.set(`user:${userId}`, JSON.stringify(userData));
  return userData;
}

function updateUser(userId: string, data: UserData): void {
  database.updateUser(userId, data);
  cache.invalidate(`user:${userId}`);   // or 'user:*' for all users
}
```

### API Response Caching

```typescript
const apiCache = CacheFactory.create<string>({ maxSize: 500, defaultTTL: 600000 });

async function fetchAPI(endpoint: string): Promise<any> {
  const cached = apiCache.get(`api:${endpoint}`);
  if (cached.hit) return JSON.parse(cached.value);

  const data = await (await fetch(endpoint)).json();
  apiCache.set(`api:${endpoint}`, JSON.stringify(data));
  return data;
}
```

### Session Management

```typescript
const sessionCache = CacheFactory.create<string>({ maxSize: 10000, defaultTTL: 3600000 });

function createSession(userId: string): string {
  const sessionId = generateSessionId();
  sessionCache.set(`session:${sessionId}`, JSON.stringify({ userId, createdAt: Date.now() }));
  return sessionId;
}

function getSession(sessionId: string): SessionData | null {
  const cached = sessionCache.get(`session:${sessionId}`);
  return cached.hit ? JSON.parse(cached.value) : null;
}

// Periodic expired-session sweep
setInterval(() => {
  sessionCache.getEntries().forEach(e => { if (e.isExpired()) sessionCache.delete(e.key); });
}, 300000);
```

### Database Query Caching

```typescript
const queryCache = CacheFactory.create<string>({ maxSize: 2000, defaultTTL: 180000 });

async function executeQuery(query: string, params: any[]): Promise<any[]> {
  const key = `query:${hash(query + JSON.stringify(params))}`;
  const cached = queryCache.get(key);
  if (cached.hit) return JSON.parse(cached.value);

  const results = await database.query(query, params);
  queryCache.set(key, JSON.stringify(results));
  return results;
}
```

## Advanced Examples

### Multi-Tier Caching (L1 → L2 → L3)

```typescript
const l1 = CacheFactory.createHighPerformance<string>();
const l2 = CacheFactory.create<string>({ maxSize: 1000, defaultTTL: 300000 });
const l3 = CacheFactory.createLargeCache<string>();

async function getMultiTier(key: string): Promise<string | null> {
  let r = l1.get(key);
  if (r.hit) return r.value;
  r = l2.get(key);
  if (r.hit) { l1.set(key, r.value); return r.value; }
  r = l3.get(key);
  if (r.hit) { l2.set(key, r.value); l1.set(key, r.value); return r.value; }
  return null;
}
```

### Statistics Monitoring

```typescript
const cache = CacheFactory.create<string>(undefined, { useDetailedStats: true });

setInterval(() => {
  const stats = cache.getStats();
  const hitRate = CacheMetrics.calculateHitRate(stats);
  if (hitRate < 0.5) {
    cache.setConfig({ maxSize: cache.getConfig().maxSize * 2 });
  }
}, 60000);
```

### Pattern-Based Invalidation

```typescript
cache.set('user:1:name', 'John');
cache.set('user:2:name', 'Jane');
cache.invalidate('user:1:*');           // removes only user:1 keys
cache.get('user:2:name').hit;           // true
```

### Error Handling

```typescript
import { CacheError, CacheKeyError } from '../utils/errors';

try {
  cache.set(key, value);
} catch (error) {
  if (error instanceof CacheKeyError) console.error('Invalid key:', error.message);
  else if (error instanceof CacheError) console.error('Cache error:', error.message);
  else throw error;
}
```

### Namespaced Cache

```typescript
class NamespacedCache {
  constructor(private ns: string, private cache: CacheManager<string>) {}
  private k(key: string) { return `${this.ns}:${key}`; }
  set(key: string, value: string, ttl?: number) { this.cache.set(this.k(key), value, ttl); }
  get(key: string) { return this.cache.get(this.k(key)); }
  delete(key: string) { this.cache.delete(this.k(key)); }
  clear() { this.cache.invalidate(`${this.ns}:*`); }
}

const userCache = new NamespacedCache('user', cache);
```

## Integration Examples

### Express.js

```typescript
const cache = CacheFactory.create<string>();

app.get('/api/users/:id', async (req, res) => {
  const key = `user:${req.params.id}`;
  const cached = cache.get(key);
  if (cached.hit) return res.json(JSON.parse(cached.value));

  const user = await database.getUser(req.params.id);
  cache.set(key, JSON.stringify(user));
  res.json(user);
});
```

## Performance Examples

### Cache Warming and Prefetching

```typescript
async function warmCache(): Promise<void> {
  (await database.getPopularItems()).forEach(item =>
    cache.set(`item:${item.id}`, JSON.stringify(item)));
}

async function prefetchRelated(userId: string): Promise<void> {
  const [orders, prefs] = await Promise.all([getUserOrders(userId), getUserPreferences(userId)]);
  cache.set(`user:${userId}:orders`, JSON.stringify(orders));
  cache.set(`user:${userId}:preferences`, JSON.stringify(prefs));
}
```

## Monitoring Examples

### Health Check and Metrics Export

```typescript
function checkCacheHealth(): HealthStatus {
  const stats = cache.getStats();
  if (stats.getHitRate() < 0.3) return { status: 'degraded', message: 'Low hit rate' };
  if (stats.size > cache.getConfig().maxSize * 0.9)
    return { status: 'warning', message: 'Cache nearly full' };
  return { status: 'healthy', message: 'Cache operating normally' };
}
```

## Best-Practice Patterns

### Write-Through / Write-Behind

```typescript
async function saveData(key: string, data: any): Promise<void> {
  await writeToSource(key, data);   // write-through: source first
  cache.set(key, data);
}

async function saveDataDelayed(key: string, data: any): Promise<void> {
  cache.set(key, data);             // write-behind: cache first
  queueWriteOperation(key, data);   // async source write
}
```
