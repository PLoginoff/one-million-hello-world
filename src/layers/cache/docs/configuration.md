# Configuration Layer Documentation

## Overview

The Configuration Layer provides comprehensive configuration management for the Cache Layer, including default configurations, validation, and a fluent builder pattern for easy configuration creation.

## Structure

```
configuration/
├── defaults/           # Default configurations
│   ├── DefaultConfigs.ts
│   └── index.ts
├── validators/         # Configuration validators
│   ├── CacheConfigValidator.ts
│   └── index.ts
├── builders/           # Configuration builders
│   ├── CacheConfigBuilder.ts
│   └── index.ts
└── index.ts
```

## Default Configurations

### Pre-configured Options

The layer provides several pre-configured options for common use cases:

```typescript
import { DefaultConfigs } from '../configuration/defaults/DefaultConfigs';

// Default configuration
const defaultConfig = DefaultConfigs.DEFAULT;
// { maxSize: 1000, defaultTTL: 60000, invalidationStrategy: LRU, enableMultiLevel: false }

// High-performance (L1 cache)
const highPerfConfig = DefaultConfigs.HIGH_PERFORMANCE;
// { maxSize: 100, defaultTTL: 30000, invalidationStrategy: LRU, enableMultiLevel: false }

// Large cache (L3 cache)
const largeConfig = DefaultConfigs.LARGE_CACHE;
// { maxSize: 10000, defaultTTL: 300000, invalidationStrategy: LFU, enableMultiLevel: false }

// Multi-level cache
const multiLevelConfig = DefaultConfigs.MULTI_LEVEL;
// { maxSize: 1000, defaultTTL: 60000, invalidationStrategy: LRU, enableMultiLevel: true }

// Time-based only
const timeBasedConfig = DefaultConfigs.TIME_BASED;
// { maxSize: 500, defaultTTL: 120000, invalidationStrategy: TIME_BASED, enableMultiLevel: false }
```

### Custom Configuration

Create custom configurations by modifying defaults:

```typescript
const customConfig = DefaultConfigs.custom({
  maxSize: 2000,
  defaultTTL: 90000,
});
```

## Configuration Validation

### CacheConfigValidator

Validates configuration settings to ensure they meet requirements.

```typescript
import { CacheConfigValidator } from '../configuration/validators/CacheConfigValidator';

// Validate complete configuration
CacheConfigValidator.validate(config);

// Validate individual properties
CacheConfigValidator.validateMaxSize(1000);
CacheConfigValidator.validateDefaultTTL(60000);
CacheConfigValidator.validateInvalidationStrategy(InvalidationStrategy.LRU);
CacheConfigValidator.validateMultiLevel(false);

// Validate partial configuration
CacheConfigValidator.validatePartial({
  maxSize: 500,
  defaultTTL: 30000,
});
```

**Validation Rules:**
- `maxSize`: Must be between 1 and 1,000,000
- `defaultTTL`: Must be between 0 and 86,400,000 (24 hours)
- `invalidationStrategy`: Must be a valid `InvalidationStrategy` enum value
- `enableMultiLevel`: Must be a boolean

## Configuration Builder

### CacheConfigBuilder

Fluent builder for creating cache configurations with method chaining.

```typescript
import { CacheConfigBuilder } from '../configuration/builders/CacheConfigBuilder';
import { InvalidationStrategy } from '../types/cache-types';

// Start with default configuration
const config = CacheConfigBuilder.create()
  .withMaxSize(1000)
  .withDefaultTTL(60000)
  .withInvalidationStrategy(InvalidationStrategy.LRU)
  .withMultiLevel(false)
  .build();

// Start with high-performance configuration
const highPerfConfig = CacheConfigBuilder.highPerformance()
  .withMaxSize(200)
  .withDefaultTTLSeconds(30)
  .build();

// Start with large cache configuration
const largeConfig = CacheConfigBuilder.largeCache()
  .withInvalidationStrategy(InvalidationStrategy.LFU)
  .build();

// Start with multi-level configuration
const multiConfig = CacheConfigBuilder.multiLevel()
  .withMaxSize(2000)
  .build();
```

### Builder Methods

- `create(): CacheConfigBuilder` - Start with default configuration
- `highPerformance(): CacheConfigBuilder` - Start with high-performance configuration
- `largeCache(): CacheConfigBuilder` - Start with large cache configuration
- `multiLevel(): CacheConfigBuilder` - Start with multi-level configuration
- `withMaxSize(maxSize: number): CacheConfigBuilder` - Set max size
- `withDefaultTTL(ttl: number): CacheConfigBuilder` - Set default TTL in milliseconds
- `withDefaultTTLSeconds(seconds: number): CacheConfigBuilder` - Set default TTL in seconds
- `withInvalidationStrategy(strategy: InvalidationStrategy): CacheConfigBuilder` - Set invalidation strategy
- `withMultiLevel(enabled: boolean): CacheConfigBuilder` - Enable/disable multi-level
- `build(): CacheConfigOptions` - Build configuration (with validation)
- `buildUnsafe(): CacheConfigOptions` - Build without validation (use with caution)

## Usage Examples

### Basic Configuration

```typescript
import { CacheConfigBuilder } from '../configuration/builders/CacheConfigBuilder';

const config = CacheConfigBuilder.create()
  .withMaxSize(500)
  .withDefaultTTLSeconds(60)
  .withInvalidationStrategy(InvalidationStrategy.LRU)
  .build();

const cache = new CacheManager<string>(config);
```

### Advanced Configuration

```typescript
const config = CacheConfigBuilder.create()
  .withMaxSize(10000)
  .withDefaultTTL(300000) // 5 minutes
  .withInvalidationStrategy(InvalidationStrategy.LFU)
  .withMultiLevel(true)
  .build();
```

### Using Defaults

```typescript
import { DefaultConfigs } from '../configuration/defaults/DefaultConfigs';

// Use pre-configured high-performance cache
const cache = new CacheManager<string>(DefaultConfigs.HIGH_PERFORMANCE);
```

### Validation Before Use

```typescript
import { CacheConfigValidator } from '../configuration/validators/CacheConfigValidator';

const config = { maxSize: 1000, defaultTTL: 60000, /* ... */ };

try {
  CacheConfigValidator.validate(config);
  // Configuration is valid
} catch (error) {
  // Handle invalid configuration
  console.error('Invalid configuration:', error.message);
}
```

## Configuration Options Interface

```typescript
export interface CacheConfigOptions {
  maxSize: number;                              // Maximum number of entries
  defaultTTL: number;                           // Default TTL in milliseconds
  invalidationStrategy: InvalidationStrategy;    // Eviction strategy
  enableMultiLevel: boolean;                     // Enable multi-level caching
}
```

## Best Practices

1. **Use builders for complex configurations**: Builder pattern provides better readability
2. **Validate before use**: Always validate configuration before creating cache instances
3. **Use pre-configured options**: Start with `HIGH_PERFORMANCE`, `LARGE_CACHE`, etc.
4. **Set appropriate TTL**: Balance between performance and data freshness
5. **Choose strategy based on access patterns**: LRU for temporal locality, LFU for frequency

## Configuration Patterns

### Small, Fast Cache (L1)

```typescript
const l1Config = CacheConfigBuilder.create()
  .withMaxSize(100)
  .withDefaultTTLSeconds(30)
  .withInvalidationStrategy(InvalidationStrategy.LRU)
  .build();
```

### Medium Cache (L2)

```typescript
const l2Config = CacheConfigBuilder.create()
  .withMaxSize(1000)
  .withDefaultTTLMinutes(5)
  .withInvalidationStrategy(InvalidationStrategy.LRU)
  .build();
```

### Large Cache (L3)

```typescript
const l3Config = CacheConfigBuilder.largeCache()
  .withInvalidationStrategy(InvalidationStrategy.LFU)
  .build();
```

### Time-Based Only

```typescript
const timeConfig = CacheConfigBuilder.create()
  .withMaxSize(500)
  .withDefaultTTLMinutes(10)
  .withInvalidationStrategy(InvalidationStrategy.TIME_BASED)
  .build();
```

## Testing Configuration

```typescript
describe('CacheConfigBuilder', () => {
  it('should build valid configuration', () => {
    const config = CacheConfigBuilder.create()
      .withMaxSize(1000)
      .withDefaultTTL(60000)
      .build();

    expect(config.maxSize).toBe(1000);
    expect(config.defaultTTL).toBe(60000);
  });

  it('should validate configuration', () => {
    expect(() => {
      CacheConfigBuilder.create()
        .withMaxSize(-1)
        .build();
    }).toThrow();
  });
});
```

## Migration from Old Configuration

Old configuration format:

```typescript
// Old way
const config = {
  maxSize: 1000,
  defaultTTL: 60000,
  invalidationStrategy: InvalidationStrategy.LRU,
  enableMultiLevel: false,
};
```

New way with builder:

```typescript
// New way
const config = CacheConfigBuilder.create()
  .withMaxSize(1000)
  .withDefaultTTL(60000)
  .withInvalidationStrategy(InvalidationStrategy.LRU)
  .withMultiLevel(false)
  .build();
```

The new way provides:
- Type safety
- Validation
- Better readability
- Method chaining
- Pre-configured options
