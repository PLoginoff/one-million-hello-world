# Quick Start Guide

## Installation

The Cache Layer is part of the one-million-hello-world project. No additional installation is required.

## Basic Usage

### 1. Import Cache Manager

```typescript
import { CacheManager } from './core/managers/CacheManager';
```

### 2. Create Cache Instance

```typescript
const cache = new CacheManager<string>();
```

### 3. Store Values

```typescript
cache.set('user:1', 'John Doe', 60000); // 60 seconds TTL
```

### 4. Retrieve Values

```typescript
const result = cache.get('user:1');
if (result.hit) {
  console.log('User:', result.value);
} else {
  console.log('Cache miss');
}
```

### 5. Delete Values

```typescript
cache.delete('user:1');
```

## Using Factories (Recommended)

### Create High-Performance Cache

```typescript
import { CacheFactory } from './factories/cache/CacheFactory';

const cache = CacheFactory.createHighPerformance<string>();
```

### Create Large Cache

```typescript
const cache = CacheFactory.createLargeCache<string>();
```

### Create Custom Cache

```typescript
const cache = CacheFactory.create<string>({
  maxSize: 500,
  defaultTTL: 30000,
});
```

## Configuration

### Using Builder

```typescript
import { CacheConfigBuilder } from './configuration/builders/CacheConfigBuilder';

const config = CacheConfigBuilder.create()
  .withMaxSize(1000)
  .withDefaultTTLSeconds(60)
  .withInvalidationStrategy(InvalidationStrategy.LRU)
  .build();

const cache = new CacheManager<string>(config);
```

### Update Configuration at Runtime

```typescript
cache.setConfig({
  maxSize: 2000,
  defaultTTL: 120000,
});
```

## Common Patterns

### Cache-Aside Pattern

```typescript
async function getData(key: string): Promise<any> {
  // Check cache
  const cached = cache.get(key);
  if (cached.hit) {
    return cached.value;
  }

  // Fetch from source
  const data = await fetchData(key);
  
  // Store in cache
  cache.set(key, data);
  
  return data;
}
```

### Pattern-Based Invalidation

```typescript
// Cache related data
cache.set('user:1:name', 'John');
cache.set('user:1:email', 'john@example.com');

// Invalidate all user:1 data
cache.invalidate('user:1:*');
```

### Statistics Monitoring

```typescript
const stats = cache.getStats();
console.log(`Hits: ${stats.hits}`);
console.log(`Misses: ${stats.misses}`);
console.log(`Hit rate: ${(stats.getHitRate() * 100).toFixed(2)}%`);
```

## Next Steps

- Read [README.md](./README.md) for overview
- Read [EXAMPLES.md](./EXAMPLES.md) for more examples
- Read [BEST_PRACTICES.md](./BEST_PRACTICES.md) for best practices
- Read layer-specific documentation for detailed information
