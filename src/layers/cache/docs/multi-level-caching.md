# Multi-Level Caching

## Overview
The Cache Layer implements multi-level caching with L1 cache for frequently accessed data, configurable cache levels, and cache level tracking in results.

## Cache Level Structure

### Cache Level Definition
```typescript
enum CacheLevel {
  L1 = 'L1',
  L2 = 'L2',
  L3 = 'L3'
}

interface CacheEntry {
  key: string;
  value: any;
  level: CacheLevel;
  ttl: number;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
}

interface CacheResult {
  value: any;
  hit: boolean;
  level: CacheLevel;
}
```

### L1 Cache Implementation
```typescript
class L1Cache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private evictionStrategy: EvictionStrategy;
  
  constructor(maxSize: number, evictionStrategy: EvictionStrategy) {
    this.maxSize = maxSize;
    this.evictionStrategy = evictionStrategy;
  }
  
  set(key: string, value: any, ttl: number): void {
    const entry: CacheEntry = {
      key,
      value,
      level: CacheLevel.L1,
      ttl,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ttl * 1000),
      accessCount: 0,
      lastAccessedAt: new Date()
    };
    
    if (this.cache.size >= this.maxSize) {
      this.evict();
    }
    
    this.cache.set(key, entry);
  }
  
  get(key: string): CacheResult | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    
    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    
    return {
      value: entry.value,
      hit: true,
      level: CacheLevel.L1
    };
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  private evict(): void {
    const keysToEvict = this.evictionStrategy.selectForEviction(this.cache);
    
    for (const key of keysToEvict) {
      this.cache.delete(key);
    }
  }
  
  private isExpired(entry: CacheEntry): boolean {
    return new Date() > entry.expiresAt;
  }
}
```

## Multi-Level Cache Manager

### Cache Manager
```typescript
class MultiLevelCacheManager {
  private l1: L1Cache;
  private l2: L1Cache;
  private l3: L1Cache;
  private multiLevelEnabled: boolean;
  
  constructor(config: CacheConfig) {
    this.l1 = new L1Cache(config.l1MaxSize, config.l1EvictionStrategy);
    this.l2 = new L1Cache(config.l2MaxSize, config.l2EvictionStrategy);
    this.l3 = new L1Cache(config.l3MaxSize, config.l3EvictionStrategy);
    this.multiLevelEnabled = config.multiLevelEnabled;
  }
  
  async get(key: string): Promise<CacheResult | null> {
    if (this.multiLevelEnabled) {
      return await this.getMultiLevel(key);
    }
    
    return this.l1.get(key);
  }
  
  async set(key: string, value: any, ttl: number): Promise<void> {
    if (this.multiLevelEnabled) {
      await this.setMultiLevel(key, value, ttl);
    } else {
      this.l1.set(key, value, ttl);
    }
  }
  
  async delete(key: string): Promise<void> {
    this.l1.delete(key);
    this.l2.delete(key);
    this.l3.delete(key);
  }
  
  async clear(): Promise<void> {
    this.l1.clear();
    this.l2.clear();
    this.l3.clear();
  }
  
  private async getMultiLevel(key: string): Promise<CacheResult | null> {
    // Try L1 first
    let result = this.l1.get(key);
    if (result) {
      return result;
    }
    
    // Try L2
    result = this.l2.get(key);
    if (result) {
      // Promote to L1
      this.l1.set(key, result.value, 300);
      return { ...result, level: CacheLevel.L1 };
    }
    
    // Try L3
    result = this.l3.get(key);
    if (result) {
      // Promote to L2 and L1
      this.l2.set(key, result.value, 600);
      this.l1.set(key, result.value, 300);
      return { ...result, level: CacheLevel.L1 };
    }
    
    return null;
  }
  
  private async setMultiLevel(key: string, value: any, ttl: number): Promise<void> {
    // Set in all levels with different TTLs
    this.l1.set(key, value, ttl);
    this.l2.set(key, value, ttl * 2);
    this.l3.set(key, value, ttl * 4);
  }
}
```

## Eviction Strategies

### Eviction Strategy Interface
```typescript
interface EvictionStrategy {
  selectForEviction(cache: Map<string, CacheEntry>): string[];
}
```

### LRU Eviction
```typescript
class LRUEvictionStrategy implements EvictionStrategy {
  selectForEviction(cache: Map<string, CacheEntry>): string[] {
    const entries = Array.from(cache.entries());
    
    entries.sort((a, b) => 
      a[1].lastAccessedAt.getTime() - b[1].lastAccessedAt.getTime()
    );
    
    return entries.slice(0, Math.ceil(cache.size * 0.1)).map(e => e[0]);
  }
}
```

### LFU Eviction
```typescript
class LFUEvictionStrategy implements EvictionStrategy {
  selectForEviction(cache: Map<string, CacheEntry>): string[] {
    const entries = Array.from(cache.entries());
    
    entries.sort((a, b) => a[1].accessCount - b[1].accessCount);
    
    return entries.slice(0, Math.ceil(cache.size * 0.1)).map(e => e[0]);
  }
}
```

## Cache Configuration

### Cache Config
```typescript
interface CacheConfig {
  multiLevelEnabled: boolean;
  l1MaxSize: number;
  l2MaxSize: number;
  l3MaxSize: number;
  l1EvictionStrategy: EvictionStrategy;
  l2EvictionStrategy: EvictionStrategy;
  l3EvictionStrategy: EvictionStrategy;
  defaultTTL: number;
}
```

### Configuration Manager
```typescript
class CacheConfigManager {
  private config: CacheConfig;
  
  constructor(config: CacheConfig) {
    this.config = config;
  }
  
  enableMultiLevel(): void {
    this.config.multiLevelEnabled = true;
  }
  
  disableMultiLevel(): void {
    this.config.multiLevelEnabled = false;
  }
  
  setMaxSize(level: CacheLevel, size: number): void {
    switch (level) {
      case CacheLevel.L1:
        this.config.l1MaxSize = size;
        break;
      case CacheLevel.L2:
        this.config.l2MaxSize = size;
        break;
      case CacheLevel.L3:
        this.config.l3MaxSize = size;
        break;
    }
  }
  
  setEvictionStrategy(level: CacheLevel, strategy: EvictionStrategy): void {
    switch (level) {
      case CacheLevel.L1:
        this.config.l1EvictionStrategy = strategy;
        break;
      case CacheLevel.L2:
        this.config.l2EvictionStrategy = strategy;
        break;
      case CacheLevel.L3:
        this.config.l3EvictionStrategy = strategy;
        break;
    }
  }
  
  getConfig(): CacheConfig {
    return { ...this.config };
  }
}
```

## Best Practices

### Cache Level Design Guidelines
- Use L1 for hot data
- Use L2 for warm data
- Use L3 for cold data
- Set appropriate TTLs per level
- Monitor cache hit rates

### Eviction Strategy Guidelines
- Use LRU for temporal locality
- Use LFU for frequency-based access
- Monitor eviction rates
- Adjust cache sizes based on patterns

### Performance Considerations
- Use efficient data structures
- Implement async operations
- Monitor cache performance
- Adjust cache sizes dynamically
