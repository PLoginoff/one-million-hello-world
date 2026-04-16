# Invalidation Strategies

## Overview
The Cache Layer implements multiple invalidation strategies including time-based expiration (TTL), LRU eviction, LFU eviction, and manual invalidation by pattern.

## Time-Based Expiration

### TTL Implementation
```typescript
class TTLManager {
  checkExpiration(entry: CacheEntry): boolean {
    return new Date() > entry.expiresAt;
  }
  
  calculateExpiry(ttl: number): Date {
    return new Date(Date.now() + ttl * 1000);
  }
  
  refreshTTL(entry: CacheEntry, ttl: number): void {
    entry.expiresAt = this.calculateExpiry(ttl);
  }
  
  getRemainingTTL(entry: CacheEntry): number {
    const remaining = entry.expiresAt.getTime() - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  }
}
```

### TTL Configuration
```typescript
interface TTLConfig {
  default: number;
  perPattern: Map<string, number>;
}

class TTLConfigManager {
  private config: TTLConfig;
  
  constructor(defaultTTL: number) {
    this.config = {
      default: defaultTTL,
      perPattern: new Map()
    };
  }
  
  setPatternTTL(pattern: string, ttl: number): void {
    this.config.perPattern.set(pattern, ttl);
  }
  
  getTTL(key: string): number {
    for (const [pattern, ttl] of this.config.perPattern) {
      if (key.match(pattern)) {
        return ttl;
      }
    }
    
    return this.config.default;
  }
}
```

## LRU Eviction

### LRU Implementation
```typescript
class LRUEvictionStrategy implements EvictionStrategy {
  selectForEviction(cache: Map<string, CacheEntry>): string[] {
    const entries = Array.from(cache.entries());
    
    entries.sort((a, b) => 
      a[1].lastAccessedAt.getTime() - b[1].lastAccessedAt.getTime()
    );
    
    const evictCount = Math.ceil(cache.size * 0.1);
    return entries.slice(0, evictCount).map(e => e[0]);
  }
}
```

### LRU Tracking
```typescript
class LRUTracker {
  private accessOrder: string[] = [];
  
  recordAccess(key: string): void {
    const index = this.accessOrder.indexOf(key);
    
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    
    this.accessOrder.push(key);
  }
  
  recordRemoval(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }
  
  getLeastRecentlyUsed(count: number): string[] {
    return this.accessOrder.slice(0, count);
  }
}
```

## LFU Eviction

### LFU Implementation
```typescript
class LFUEvictionStrategy implements EvictionStrategy {
  selectForEviction(cache: Map<string, CacheEntry>): string[] {
    const entries = Array.from(cache.entries());
    
    entries.sort((a, b) => a[1].accessCount - b[1].accessCount);
    
    const evictCount = Math.ceil(cache.size * 0.1);
    return entries.slice(0, evictCount).map(e => e[0]);
  }
}
```

### LFU Tracking
```typescript
class LFUTracker {
  private accessCounts: Map<string, number> = new Map();
  
  recordAccess(key: string): void {
    const current = this.accessCounts.get(key) || 0;
    this.accessCounts.set(key, current + 1);
  }
  
  recordRemoval(key: string): void {
    this.accessCounts.delete(key);
  }
  
  getLeastFrequentlyUsed(count: number): string[] {
    const entries = Array.from(this.accessCounts.entries());
    
    entries.sort((a, b) => a[1] - b[1]);
    
    return entries.slice(0, count).map(e => e[0]);
  }
}
```

## Pattern-Based Invalidation

### Pattern Invalidation
```typescript
class PatternInvalidator {
  invalidate(cache: Map<string, CacheEntry>, pattern: string): void {
    const regex = new RegExp(pattern);
    
    for (const key of cache.keys()) {
      if (regex.test(key)) {
        cache.delete(key);
      }
    }
  }
  
  invalidateByPrefix(cache: Map<string, CacheEntry>, prefix: string): void {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
  }
  
  invalidateBySuffix(cache: Map<string, CacheEntry>, suffix: string): void {
    for (const key of cache.keys()) {
      if (key.endsWith(suffix)) {
        cache.delete(key);
      }
    }
  }
}
```

### Invalidation Manager
```typescript
class InvalidationManager {
  private caches: Map<CacheLevel, Map<string, CacheEntry>> = new Map();
  private patternInvalidator: PatternInvalidator;
  
  constructor(caches: Map<CacheLevel, Map<string, CacheEntry>>) {
    this.caches = caches;
    this.patternInvalidator = new PatternInvalidator();
  }
  
  invalidatePattern(pattern: string): void {
    for (const cache of this.caches.values()) {
      this.patternInvalidator.invalidate(cache, pattern);
    }
  }
  
  invalidatePrefix(prefix: string): void {
    for (const cache of this.caches.values()) {
      this.patternInvalidator.invalidateByPrefix(cache, prefix);
    }
  }
  
  invalidateSuffix(suffix: string): void {
    for (const cache of this.caches.values()) {
      this.patternInvalidator.invalidateBySuffix(cache, suffix);
    }
  }
}
```

## Manual Invalidation

### Manual Invalidation Operations
```typescript
class ManualInvalidator {
  delete(key: string): void {
    this.l1Cache.delete(key);
    this.l2Cache.delete(key);
    this.l3Cache.delete(key);
  }
  
  clear(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();
    this.l3Cache.clear();
  }
  
  clearLevel(level: CacheLevel): void {
    switch (level) {
      case CacheLevel.L1:
        this.l1Cache.clear();
        break;
      case CacheLevel.L2:
        this.l2Cache.clear();
        break;
      case CacheLevel.L3:
        this.l3Cache.clear();
        break;
    }
  }
}
```

## Best Practices

### TTL Guidelines
- Set appropriate TTLs based on data volatility
- Use shorter TTLs for frequently changing data
- Use longer TTLs for static data
- Monitor cache expiration rates

### Eviction Strategy Guidelines
- Use LRU for temporal locality patterns
- Use LFU for stable access patterns
- Monitor eviction effectiveness
- Adjust strategy based on workload

### Pattern Invalidation Guidelines
- Use specific patterns to avoid over-invalidation
- Document invalidation patterns
- Test pattern matching thoroughly
- Monitor invalidation impact
