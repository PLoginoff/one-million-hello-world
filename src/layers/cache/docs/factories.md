# Factories Layer Documentation

## Overview

The Factories Layer provides factory classes for creating cache components and fully configured cache instances. This simplifies cache creation and ensures proper configuration.

## Structure

```
factories/
├── strategies/         # Strategy factories
│   ├── EvictionStrategyFactory.ts
│   └── index.ts
├── storage/           # Storage factories
│   ├── StorageFactory.ts
│   └── index.ts
├── cache/             # Cache factories
│   ├── CacheFactory.ts
│   └── index.ts
└── index.ts
```

## Strategy Factories

### EvictionStrategyFactory

Factory for creating eviction strategy instances.

```typescript
import { EvictionStrategyFactory } from '../factories/strategies/EvictionStrategyFactory';
import { InvalidationStrategy } from '../types/cache-types';

// Create by type
const lruStrategy = EvictionStrategyFactory.create<string>(InvalidationStrategy.LRU);
const lfuStrategy = EvictionStrategyFactory.create<string>(InvalidationStrategy.LFU);

// Create directly
const lru = EvictionStrategyFactory.createLRU<string>();
const lfu = EvictionStrategyFactory.createLFU<string>();
const fifo = EvictionStrategyFactory.createFIFO<string>();
const random = EvictionStrategyFactory.createRandom<string>();

// Get available strategies
const strategies = EvictionStrategyFactory.getAvailableStrategies();
// ['LRU', 'LFU', 'FIFO', 'RANDOM']
```

### Methods

- `create<T>(strategy: InvalidationStrategy): IEvictionStrategy<T>` - Create by type
- `createLRU<T>(): IEvictionStrategy<T>` - Create LRU strategy
- `createLFU<T>(): IEvictionStrategy<T>` - Create LFU strategy
- `createFIFO<T>(): IEvictionStrategy<T>` - Create FIFO strategy
- `createRandom<T>(): IEvictionStrategy<T>` - Create Random strategy
- `getAvailableStrategies(): string[]` - Get available strategy names

## Storage Factories

### StorageFactory

Factory for creating storage instances.

```typescript
import { StorageFactory } from '../factories/storage/StorageFactory';

// Create by type
const inMemory = StorageFactory.create<string>('IN_MEMORY');
const distributed = StorageFactory.create<string>('DISTRIBUTED', { nodeId: 'node-1' });

// Create directly
const memory = StorageFactory.createInMemory<string>();
const dist = StorageFactory.createDistributed<string>('node-1');

// Get available types
const types = StorageFactory.getAvailableTypes();
// ['IN_MEMORY', 'DISTRIBUTED']
```

### Methods

- `create<T>(type: StorageType, options?: any): IStorage<T>` - Create by type
- `createInMemory<T>(): IStorage<T>` - Create in-memory storage
- `createDistributed<T>(nodeId?: string): IStorage<T>` - Create distributed storage
- `getAvailableTypes(): StorageType[]` - Get available storage types

## Cache Factories

### CacheFactory

Factory for creating fully configured cache instances with pre-configured options.

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

// Create with default configuration
const cache = CacheFactory.create<string>();

// Create with custom configuration
const cache = CacheFactory.create<string>({
  maxSize: 500,
  defaultTTL: 30000,
});

// Create with options
const cache = CacheFactory.create<string>(
  { maxSize: 1000 },
  { storageType: 'IN_MEMORY', useDetailedStats: true }
);
```

### Pre-configured Caches

#### High-Performance Cache (L1)

```typescript
const cache = CacheFactory.createHighPerformance<string>();
// maxSize: 100, defaultTTL: 30000, strategy: LRU
```

Best for: Hot data, frequently accessed items, low-latency requirements

#### Large Cache (L3)

```typescript
const cache = CacheFactory.createLargeCache<string>();
// maxSize: 10000, defaultTTL: 300000, strategy: LFU
```

Best for: Large datasets, infrequently changing data, memory abundance

#### Multi-Level Cache

```typescript
const cache = CacheFactory.createMultiLevel<string>();
// maxSize: 1000, defaultTTL: 60000, strategy: LRU, enableMultiLevel: true
```

Best for: Hierarchical caching, multiple cache tiers

#### Time-Based Cache

```typescript
const cache = CacheFactory.createTimeBased<string>();
// maxSize: 500, defaultTTL: 120000, strategy: TIME_BASED
```

Best for: Time-sensitive data, session data, API responses

### Factory Options

```typescript
interface CacheFactoryOptions {
  storageType?: 'IN_MEMORY' | 'DISTRIBUTED';
  useDetailedStats?: boolean;
  nodeId?: string;
}
```

### Methods

- `create<T>(config?: Partial<CacheConfigOptions>, options?: CacheFactoryOptions): CacheManager<T>` - Create with config
- `createHighPerformance<T>(options?: CacheFactoryOptions): CacheManager<T>` - Create high-performance cache
- `createLargeCache<T>(options?: CacheFactoryOptions): CacheManager<T>` - Create large cache
- `createMultiLevel<T>(options?: CacheFactoryOptions): CacheManager<T>` - Create multi-level cache
- `createTimeBased<T>(options?: CacheFactoryOptions): CacheManager<T>` - Create time-based cache
- `createCustom<T>(config: CacheConfigOptions, options?: CacheFactoryOptions): CacheManager<T>` - Create custom cache

## Usage Examples

### Creating a Simple Cache

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

const cache = CacheFactory.create<string>();

cache.set('key1', 'value1');
const result = cache.get('key1');
```

### Creating a High-Performance Cache

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

const cache = CacheFactory.createHighPerformance<string>();

cache.set('hot:data', 'value');
const result = cache.get('hot:data');
```

### Creating a Cache with Detailed Statistics

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

const cache = CacheFactory.create<string>(
  { maxSize: 1000 },
  { useDetailedStats: true }
);

// Access detailed statistics
const stats = cache.getStats();
```

### Creating a Distributed Cache

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';

const cache = CacheFactory.create<string>(
  { maxSize: 5000 },
  { storageType: 'DISTRIBUTED', nodeId: 'node-1' }
);
```

### Creating a Custom Cache

```typescript
import { CacheFactory } from '../factories/cache/CacheFactory';
import { CacheConfigBuilder } from '../configuration/builders/CacheConfigBuilder';

const config = CacheConfigBuilder.create()
  .withMaxSize(2000)
  .withDefaultTTLSeconds(120)
  .withInvalidationStrategy(InvalidationStrategy.LFU)
  .build();

const cache = CacheFactory.createCustom<string>(config);
```

## Factory Patterns

### Strategy Selection Pattern

```typescript
function getEvictionStrategy<T>(pattern: string): IEvictionStrategy<T> {
  switch (pattern) {
    case 'temporal':
      return EvictionStrategyFactory.createLRU<T>();
    case 'frequency':
      return EvictionStrategyFactory.createLFU<T>();
    case 'simple':
      return EvictionStrategyFactory.createFIFO<T>();
    default:
      return EvictionStrategyFactory.createRandom<T>();
  }
}
```

### Storage Selection Pattern

```typescript
function getStorage<T>(environment: string): IStorage<T> {
  switch (environment) {
    case 'production':
      return StorageFactory.createDistributed<T>();
    case 'development':
    case 'test':
      return StorageFactory.createInMemory<T>();
    default:
      return StorageFactory.createInMemory<T>();
  }
}
```

### Cache Creation Pattern

```typescript
function createCacheForUseCase<T>(useCase: string): CacheManager<T> {
  switch (useCase) {
    case 'high-performance':
      return CacheFactory.createHighPerformance<T>();
    case 'large-dataset':
      return CacheFactory.createLargeCache<T>();
    case 'multi-tier':
      return CacheFactory.createMultiLevel<T>();
    case 'time-sensitive':
      return CacheFactory.createTimeBased<T>();
    default:
      return CacheFactory.create<T>();
  }
}
```

## Advanced Factory Usage

### Custom Factory Extension

```typescript
class CustomCacheFactory extends CacheFactory {
  static createWebCache<T>(): CacheManager<T> {
    return this.create<T>({
      maxSize: 500,
      defaultTTL: 300000, // 5 minutes
      invalidationStrategy: InvalidationStrategy.LRU,
    });
  }

  static createAPICache<T>(): CacheManager<T> {
    return this.create<T>({
      maxSize: 1000,
      defaultTTL: 600000, // 10 minutes
      invalidationStrategy: InvalidationStrategy.LFU,
    });
  }

  static createSessionCache<T>(): CacheManager<T> {
    return this.create<T>({
      maxSize: 10000,
      defaultTTL: 3600000, // 1 hour
      invalidationStrategy: InvalidationStrategy.LRU,
    });
  }
}
```

### Factory with Environment Detection

```typescript
function createEnvironmentAwareCache<T>(): CacheManager<T> {
  const env = process.env.NODE_ENV || 'development';

  const options: CacheFactoryOptions = {
    storageType: env === 'production' ? 'DISTRIBUTED' : 'IN_MEMORY',
    useDetailedStats: env === 'development',
    nodeId: process.env.NODE_ID,
  };

  return CacheFactory.create<T>(undefined, options);
}
```

## Testing with Factories

```typescript
describe('CacheFactory', () => {
  it('should create cache with default config', () => {
    const cache = CacheFactory.create<string>();
    
    expect(cache).toBeDefined();
    expect(cache.getConfig().maxSize).toBe(1000);
  });

  it('should create high-performance cache', () => {
    const cache = CacheFactory.createHighPerformance<string>();
    
    expect(cache.getConfig().maxSize).toBe(100);
    expect(cache.getConfig().defaultTTL).toBe(30000);
  });

  it('should create large cache', () => {
    const cache = CacheFactory.createLargeCache<string>();
    
    expect(cache.getConfig().maxSize).toBe(10000);
  });
});
```

## Best Practices

1. **Use factories for consistency**: Always use factories instead of direct instantiation
2. **Choose pre-configured options**: Use `createHighPerformance`, `createLargeCache`, etc. when appropriate
3. **Environment-specific configuration**: Use environment variables to select factory options
4. **Custom factories for domains**: Extend factories for domain-specific cache configurations
5. **Validate factory output**: Test factory-created instances before use
6. **Document custom factories**: Document any custom factory methods for team use
7. **Use builder for complex configs**: Combine CacheConfigBuilder with CacheFactory for complex configurations

## Factory vs Direct Instantiation

### Direct Instantiation

```typescript
// More verbose, error-prone
const storage = new InMemoryStorage<string>();
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

const cache = new CacheManager<string>(config);
```

### Factory Approach

```typescript
// Simple, consistent, less error-prone
const cache = CacheFactory.create<string>();
```

## Migration Guide

### From Direct Instantiation

**Before:**
```typescript
const cache = new CacheManager<string>({
  maxSize: 1000,
  defaultTTL: 60000,
  invalidationStrategy: InvalidationStrategy.LRU,
  enableMultiLevel: false,
});
```

**After:**
```typescript
const cache = CacheFactory.create<string>({
  maxSize: 1000,
  defaultTTL: 60000,
  invalidationStrategy: InvalidationStrategy.LRU,
});
```

### From Custom Configuration

**Before:**
```typescript
const config = CacheConfigBuilder.create()
  .withMaxSize(500)
  .withDefaultTTL(30000)
  .build();

const cache = new CacheManager<string>(config);
```

**After:**
```typescript
const cache = CacheFactory.create<string>({
  maxSize: 500,
  defaultTTL: 30000,
});
```

Or use pre-configured:

```typescript
const cache = CacheFactory.createHighPerformance<string>();
```

## Troubleshooting

### Factory Returns Wrong Configuration

**Problem**: Factory creates cache with unexpected configuration

**Solution**: Verify factory method and parameters, check default configurations

### Custom Factory Not Working

**Problem**: Custom factory extension not functioning

**Solution**: Ensure proper inheritance and method override

### Storage Type Not Available

**Problem**: Requested storage type not available

**Solution**: Check `StorageFactory.getAvailableTypes()` and use available type
