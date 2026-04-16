# Migration Guide

## Overview

This guide helps you migrate from the old Cache Layer implementation to the new Clean Architecture implementation.

## What Changed

### Architecture Changes

**Before:**
```
cache/
├── interfaces/
├── implementations/
├── types/
└── __tests__/
```

**After:**
```
cache/
├── domain/              # New - Core business logic
├── configuration/      # New - Configuration management
├── strategies/         # New - Eviction/invalidation strategies
├── statistics/         # New - Statistics collection
├── storage/            # New - Storage abstractions
├── core/               # New - Core cache logic
├── factories/          # New - Factory classes
├── utils/              # New - Utilities and errors
├── interfaces/         # Kept for backward compatibility
├── implementations/    # Kept for backward compatibility
├── types/              # Kept for backward compatibility
└── __tests__/          # Updated for new architecture
```

### API Changes

Most APIs remain compatible, but some changes are recommended.

## Migration Steps

### Step 1: Update Imports

**Before:**
```typescript
import { CacheManager } from './implementations/CacheManager';
import { InvalidationStrategy } from './types/cache-types';
```

**After:**
```typescript
import { CacheManager } from './core/managers/CacheManager';
import { InvalidationStrategy } from './types/cache-types';
```

Or use the main index:

```typescript
import { CacheManager } from './index';
```

### Step 2: Update Cache Creation

**Before:**
```typescript
const cache = new CacheManager();
cache.setConfig({
  maxSize: 1000,
  defaultTTL: 60000,
  invalidationStrategy: InvalidationStrategy.LRU,
  enableMultiLevel: false,
});
```

**After (Recommended - use Factory):**
```typescript
import { CacheFactory } from './factories/cache/CacheFactory';

const cache = CacheFactory.create<string>({
  maxSize: 1000,
  defaultTTL: 60000,
});
```

**After (Compatible):**
```typescript
const cache = new CacheManager<string>();
cache.setConfig({
  maxSize: 1000,
  defaultTTL: 60000,
  invalidationStrategy: InvalidationStrategy.LRU,
  enableMultiLevel: false,
});
```

### Step 3: Update Configuration

**Before:**
```typescript
const config = {
  maxSize: 1000,
  defaultTTL: 60000,
  invalidationStrategy: InvalidationStrategy.LRU,
  enableMultiLevel: false,
};
```

**After (Recommended - use Builder):**
```typescript
import { CacheConfigBuilder } from './configuration/builders/CacheConfigBuilder';

const config = CacheConfigBuilder.create()
  .withMaxSize(1000)
  .withDefaultTTLSeconds(60)
  .withInvalidationStrategy(InvalidationStrategy.LRU)
  .build();
```

### Step 4: Update Statistics Access

**Before:**
```typescript
const stats = cache.getStats();
console.log(stats.hits, stats.misses);
```

**After (Compatible):**
```typescript
const stats = cache.getStats();
console.log(stats.hits, stats.misses);

// New: Use metrics utilities
import { CacheMetrics } from './statistics/metrics/CacheMetrics';
const hitRate = CacheMetrics.calculateHitRate(stats);
console.log(`Hit rate: ${(hitRate * 100).toFixed(2)}%`);
```

### Step 5: Update Type Definitions

**Before:**
```typescript
import { CacheEntry, CacheStats } from './types/cache-types';
```

**After (Recommended):**
```typescript
import { CacheEntry } from './domain/entities/CacheEntry';
import { CacheStats } from './domain/value-objects/CacheStats';
```

**After (Compatible):**
```typescript
import { CacheEntry, CacheStats } from './types/cache-types';
```

## Migration Examples

### Simple Cache Usage

**Before:**
```typescript
import { CacheManager } from './implementations/CacheManager';

const cache = new CacheManager();
cache.set('key', 'value', 60000);
const result = cache.get('key');
```

**After:**
```typescript
import { CacheManager } from './core/managers/CacheManager';

const cache = new CacheManager<string>();
cache.set('key', 'value', 60000);
const result = cache.get('key');
```

### Using Pre-configured Caches

**Before:**
```typescript
const cache = new CacheManager();
cache.setConfig({
  maxSize: 100,
  defaultTTL: 30000,
  invalidationStrategy: InvalidationStrategy.LRU,
});
```

**After:**
```typescript
import { CacheFactory } from './factories/cache/CacheFactory';

const cache = CacheFactory.createHighPerformance<string>();
```

### Custom Strategy Usage

**Before:**
```typescript
// Strategies were built into CacheManager
const cache = new CacheManager();
cache.setConfig({
  invalidationStrategy: InvalidationStrategy.LFU,
});
```

**After:**
```typescript
// Strategies are now separate components
import { EvictionStrategyFactory } from './factories/strategies/EvictionStrategyFactory';

const strategy = EvictionStrategyFactory.createLFU<string>();
// Strategy is used internally by CacheService
```

### Error Handling

**Before:**
```typescript
try {
  cache.set('key', 'value');
} catch (error) {
  console.error(error);
}
```

**After (Recommended):**
```typescript
import { CacheError, CacheKeyError } from './utils/errors';

try {
  cache.set('key', 'value');
} catch (error) {
  if (error instanceof CacheKeyError) {
    console.error('Invalid key:', error.message);
  } else if (error instanceof CacheError) {
    console.error('Cache error:', error.message);
  }
}
```

## Breaking Changes

### Type Parameters

**Before:**
```typescript
const cache = new CacheManager(); // Implicit any
```

**After:**
```typescript
const cache = new CacheManager<string>(); // Explicit generic
```

### Configuration Interface

**Before:**
```typescript
interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  invalidationStrategy: InvalidationStrategy;
  enableMultiLevel: boolean;
}
```

**After:**
```typescript
interface CacheConfigOptions {
  maxSize: number;
  defaultTTL: number;
  invalidationStrategy: InvalidationStrategy;
  enableMultiLevel: boolean;
}
```

The interface name changed but structure is compatible.

### Statistics Methods

**Before:**
```typescript
const stats = cache.getStats();
const hitRate = stats.hits / (stats.hits + stats.misses);
```

**After:**
```typescript
const stats = cache.getStats();
const hitRate = stats.getHitRate(); // Built-in method
```

## Compatibility Mode

The old interfaces and implementations are kept for backward compatibility:

```typescript
// Still works
import { ICacheManager } from './interfaces/ICacheManager';
import { CacheManager as OldCacheManager } from './implementations/CacheManager';
import { CacheEntry, CacheStats } from './types/cache-types';
```

However, it's recommended to migrate to the new architecture.

## Migration Checklist

- [ ] Update imports from `implementations/` to `core/managers/`
- [ ] Update cache creation to use generics
- [ ] Consider using `CacheFactory` for cache creation
- [ ] Consider using `CacheConfigBuilder` for configuration
- [ ] Update type imports to use domain layer
- [ ] Update error handling to use specific error types
- [ ] Add statistics metrics using `CacheMetrics`
- [ ] Update tests to use new architecture
- [ ] Remove old imports after verification
- [ ] Update documentation

## Rollback Plan

If issues arise during migration:

1. **Revert imports:**
```typescript
import { CacheManager } from './implementations/CacheManager';
```

2. **Revert configuration:**
```typescript
const config = {
  maxSize: 1000,
  defaultTTL: 60000,
  invalidationStrategy: InvalidationStrategy.LRU,
  enableMultiLevel: false,
};
```

3. **Test thoroughly** before proceeding with migration again.

## Testing Migration

### Unit Tests

Update test imports:

**Before:**
```typescript
import { CacheManager } from '../implementations/CacheManager';
```

**After:**
```typescript
import { CacheManager } from '../core/managers/CacheManager';
import { CacheFactory } from '../factories/cache/CacheFactory';
```

### Integration Tests

Test cache behavior with new architecture:

```typescript
describe('Cache Migration', () => {
  it('should work with new CacheManager', () => {
    const cache = new CacheManager<string>();
    cache.set('key', 'value');
    const result = cache.get('key');
    expect(result.hit).toBe(true);
  });

  it('should work with CacheFactory', () => {
    const cache = CacheFactory.create<string>();
    cache.set('key', 'value');
    const result = cache.get('key');
    expect(result.hit).toBe(true);
  });
});
```

## Performance Impact

The new architecture may have slight performance differences:

- **Memory**: Slightly higher due to layered architecture
- **Latency**: Minimal impact (< 1ms)
- **Throughput**: Similar or better due to optimizations

Monitor performance after migration and adjust configuration if needed.

## Support

If you encounter issues during migration:

1. Check this migration guide
2. Review layer-specific documentation
3. Check examples in EXAMPLES.md
4. Review best practices in BEST_PRACTICES.md

## Timeline

Recommended migration timeline:

- **Week 1**: Update imports and basic usage
- **Week 2**: Migrate to factories and builders
- **Week 3**: Update error handling and statistics
- **Week 4**: Update tests and documentation
- **Week 5**: Remove old code and finalize

## Conclusion

The new Clean Architecture provides:

- Better separation of concerns
- Easier testing
- More flexibility
- Better maintainability
- Enhanced documentation

Migration is straightforward with backward compatibility maintained.
