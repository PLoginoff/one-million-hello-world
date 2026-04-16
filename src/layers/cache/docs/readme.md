# Cache Layer Documentation

## Overview

The Cache Layer is a sophisticated, multi-layered caching system built on Clean Architecture principles. It provides flexible, high-performance caching with multiple eviction strategies, comprehensive statistics tracking, and extensible storage backends.

## Architecture

The Cache Layer follows Clean Architecture with clear separation of concerns:

```
cache/
├── domain/              # Core business logic (entities, value objects, services)
├── configuration/       # Configuration management with validation and builders
├── strategies/         # Eviction and invalidation strategies
├── statistics/         # Statistics collection and metrics
├── storage/            # Storage abstractions and implementations
├── core/               # Core cache services and managers
├── factories/          # Factory classes for component creation
├── utils/              # Utility functions and error classes
├── interfaces/         # Public interfaces (legacy compatibility)
├── types/              # Public type definitions (legacy compatibility)
├── implementations/    # Public implementations (legacy compatibility)
└── docs/               # Documentation
```

## Key Features

- **Clean Architecture**: Layered design with clear separation of concerns
- **Multiple Eviction Strategies**: LRU, LFU, FIFO, Random
- **Flexible Configuration**: Builder pattern with validation
- **Statistics Tracking**: Basic and detailed statistics collectors
- **Storage Abstraction**: Pluggable storage backends (in-memory, distributed)
- **Type Safety**: Full TypeScript support with generics
- **Factory Pattern**: Easy cache creation with pre-configured options
- **Extensible**: Easy to add new strategies, storage backends, and collectors

## Quick Start

### Basic Usage

```typescript
import { CacheManager } from './core/managers/CacheManager';

// Create cache with default configuration
const cache = new CacheManager<string>();

// Set value
cache.set('user:1', 'John Doe', 60000); // 60 seconds TTL

// Get value
const result = cache.get('user:1');
if (result.hit) {
  console.log(result.value); // 'John Doe'
}

// Delete value
cache.delete('user:1');
```

### Using Factory

```typescript
import { CacheFactory } from './factories/cache/CacheFactory';

// Create high-performance cache
const cache = CacheFactory.createHighPerformance<string>();

// Create large cache
const largeCache = CacheFactory.createLargeCache<object>();

// Create custom cache
const customCache = CacheFactory.create<string>({
  maxSize: 500,
  defaultTTL: 30000,
  invalidationStrategy: InvalidationStrategy.LFU,
  enableMultiLevel: false,
});
```

### Using Configuration Builder

```typescript
import { CacheConfigBuilder } from './configuration/builders/CacheConfigBuilder';

const config = CacheConfigBuilder.create()
  .withMaxSize(1000)
  .withDefaultTTLSeconds(60)
  .withInvalidationStrategy(InvalidationStrategy.LRU)
  .withMultiLevel(false)
  .build();

const cache = new CacheManager<string>(config);
```

## Layer Documentation

- [Domain Layer](./DOMAIN.md) - Entities, value objects, and domain services
- [Configuration Layer](./CONFIGURATION.md) - Configuration management
- [Strategies Layer](./STRATEGIES.md) - Eviction and invalidation strategies
- [Statistics Layer](./STATISTICS.md) - Statistics collection and metrics
- [Storage Layer](./STORAGE.md) - Storage abstractions and implementations
- [Core Layer](./CORE.md) - Core cache services and managers
- [Factories Layer](./FACTORIES.md) - Factory classes
- [Utils Layer](./UTILS.md) - Utility functions and errors

## Examples

- [Quick Start Examples](./EXAMPLES.md)
- [Best Practices](./BEST_PRACTICES.md)
- [Migration Guide](./MIGRATION.md)

## Testing

See [Testing Documentation](./TESTING.md) for comprehensive testing strategies.

## Architecture Decisions

See [Architecture Documentation](./ARCHITECTURE.md) for detailed architectural decisions and rationale.

## License

Part of the one-million-hello-world project.
