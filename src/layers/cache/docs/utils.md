# Utils Layer Documentation

## Overview

The Utils Layer provides utility functions and custom error classes used throughout the Cache Layer. These utilities support common operations and provide consistent error handling.

## Structure

```
utils/
├── errors/            # Custom error classes
│   ├── CacheError.ts
│   └── index.ts
├── helpers/           # Utility helper functions
│   ├── CacheHelper.ts
│   └── index.ts
└── index.ts
```

## Error Classes

### CacheError

Base error class for all cache-related errors.

```typescript
import { CacheError } from '../utils/errors/CacheError';

throw new CacheError('Generic cache error');
```

### CacheKeyError

Error for cache key-related issues.

```typescript
import { CacheKeyError } from '../utils/errors/CacheError';

throw new CacheKeyError('Invalid cache key format');
```

**Use Cases:**
- Invalid key format
- Empty key
- Key too long
- Key contains invalid characters

### CacheConfigError

Error for configuration-related issues.

```typescript
import { CacheConfigError } from '../utils/errors/CacheError';

throw new CacheConfigError('Invalid cache configuration');
```

**Use Cases:**
- Invalid configuration values
- Configuration validation failures
- Missing required configuration

### CacheStorageError

Error for storage-related issues.

```typescript
import { CacheStorageError } from '../utils/errors/CacheError';

throw new CacheStorageError('Storage operation failed');
```

**Use Cases:**
- Storage read/write failures
- Storage capacity exceeded
- Storage connection issues

### CacheEvictionError

Error for eviction-related issues.

```typescript
import { CacheEvictionError } from '../utils/errors/CacheError';

throw new CacheEvictionError('Eviction strategy failed');
```

**Use Cases:**
- Eviction strategy failures
- Unable to evict entries
- Eviction deadlock

## Error Handling Pattern

```typescript
import {
  CacheError,
  CacheKeyError,
  CacheConfigError,
  CacheStorageError,
  CacheEvictionError,
} from '../utils/errors';

try {
  cache.set('key', 'value');
} catch (error) {
  if (error instanceof CacheKeyError) {
    console.error('Key error:', error.message);
  } else if (error instanceof CacheConfigError) {
    console.error('Configuration error:', error.message);
  } else if (error instanceof CacheStorageError) {
    console.error('Storage error:', error.message);
  } else if (error instanceof CacheEvictionError) {
    console.error('Eviction error:', error.message);
  } else if (error instanceof CacheError) {
    console.error('Cache error:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Helper Functions

### CacheHelper

Utility class for common cache operations.

#### hashKey(key: string): number

Generates a hash for a cache key.

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

const hash = CacheHelper.hashKey('user:12345');
console.log(hash); // 123456789
```

**Use Cases:**
- Quick key comparisons
- Hash-based routing
- Key distribution

#### isExpired<T>(entry: CacheEntry<T>, currentTime?: number): boolean

Checks if a cache entry is expired.

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

const expired = CacheHelper.isExpired(entry);
if (expired) {
  console.log('Entry has expired');
}
```

#### formatBytes(bytes: number): string

Formats byte count to human-readable format.

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

console.log(CacheHelper.formatBytes(1024)); // '1 KB'
console.log(CacheHelper.formatBytes(1048576)); // '1 MB'
console.log(CacheHelper.formatBytes(1073741824)); // '1 GB'
```

#### formatDuration(ms: number): string

Formats milliseconds to human-readable duration.

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

console.log(CacheHelper.formatDuration(500)); // '500ms'
console.log(CacheHelper.formatDuration(1500)); // '1.5s'
console.log(CacheHelper.formatDuration(90000)); // '1.5m'
console.log(CacheHelper.formatDuration(7200000)); // '2.0h'
```

#### deepClone<T>(obj: T): T

Deep clones an object.

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

const original = { a: 1, b: { c: 2 } };
const cloned = CacheHelper.deepClone(original);

cloned.b.c = 3;
console.log(original.b.c); // Still 2
```

**Use Cases:**
- Cloning cached values before return
- Preventing cache pollution
- Immutable value returns

#### sanitizeKey(key: string): string

Sanitizes a cache key by replacing invalid characters.

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

const sanitized = CacheHelper.sanitizeKey('user@123#456');
console.log(sanitized); // 'user_123_456'
```

#### isValidPattern(pattern: string): boolean

Validates if a string is a valid regex pattern.

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

console.log(CacheHelper.isValidPattern('user:*')); // true
console.log(CacheHelper.isValidPattern('[invalid')); // false
```

## Usage Examples

### Error Handling

```typescript
import { CacheKeyError, CacheConfigError } from '../utils/errors';

function setCacheValue(key: string, value: any) {
  try {
    if (!key || key.length === 0) {
      throw new CacheKeyError('Cache key cannot be empty');
    }
    
    if (key.length > 255) {
      throw new CacheKeyError('Cache key too long');
    }
    
    cache.set(key, value);
  } catch (error) {
    if (error instanceof CacheKeyError) {
      console.error('Invalid key:', error.message);
      throw error;
    }
    throw error;
  }
}
```

### Key Hashing

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

function distributeKey(key: string, shardCount: number): number {
  const hash = CacheHelper.hashKey(key);
  return hash % shardCount;
}

const shard = distributeKey('user:12345', 10);
console.log(`Key belongs to shard ${shard}`);
```

### Formatting for Display

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

function displayCacheStats(stats: CacheStats) {
  console.log(`Size: ${CacheHelper.formatBytes(stats.size * 100)}`);
  console.log(`TTL: ${CacheHelper.formatDuration(stats.defaultTTL)}`);
}
```

### Key Validation

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

function validateAndSanitizeKey(key: string): string {
  if (!CacheHelper.isValidPattern(key)) {
    throw new Error('Invalid key pattern');
  }
  return CacheHelper.sanitizeKey(key);
}

const safeKey = validateAndSanitizeKey('user@123');
```

### Deep Cloning

```typescript
import { CacheHelper } from '../utils/helpers/CacheHelper';

function getCachedValue<T>(key: string): T | undefined {
  const result = cache.get(key);
  if (result.hit && result.value) {
    // Return a clone to prevent external modifications
    return CacheHelper.deepClone(result.value);
  }
  return undefined;
}
```

## Advanced Patterns

### Error Boundary Pattern

```typescript
class CacheErrorBoundary {
  private handlers: Map<string, (error: CacheError) => void>;

  constructor() {
    this.handlers = new Map();
  }

  registerHandler(errorType: string, handler: (error: CacheError) => void): void {
    this.handlers.set(errorType, handler);
  }

  handle(error: Error): void {
    if (error instanceof CacheError) {
      const handler = this.handlers.get(error.name);
      if (handler) {
        handler(error);
        return;
      }
    }
    console.error('Unhandled error:', error);
  }
}

const errorBoundary = new CacheErrorBoundary();
errorBoundary.registerHandler('CacheKeyError', (error) => {
  console.error('Key error handled:', error.message);
});
```

### Key Namespace Pattern

```typescript
class CacheKeyNamespace {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  createKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  extractKey(fullKey: string): string {
    return fullKey.replace(`${this.prefix}:`, '');
  }

  validateKey(key: string): boolean {
    return key.startsWith(`${this.prefix}:`);
  }
}

const userCache = new CacheKeyNamespace('user');
const productCache = new CacheKeyNamespace('product');

const userKey = userCache.createKey('123'); // 'user:123'
const productKey = productCache.createKey('456'); // 'product:456'
```

### Metrics Collection Pattern

```typescript
class CacheMetricsCollector {
  private metrics: Map<string, number>;

  constructor() {
    this.metrics = new Map();
  }

  record(operation: string, duration: number): void {
    const key = `${operation}_duration`;
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + duration);
  }

  getAverage(operation: string): number {
    const key = `${operation}_duration`;
    const total = this.metrics.get(key) || 0;
    const count = this.metrics.get(`${operation}_count`) || 1;
    return total / count;
  }
}
```

## Testing Utils

```typescript
describe('CacheHelper', () => {
  describe('hashKey', () => {
    it('should generate consistent hash', () => {
      const hash1 = CacheHelper.hashKey('test');
      const hash2 = CacheHelper.hashKey('test');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different keys', () => {
      const hash1 = CacheHelper.hashKey('test1');
      const hash2 = CacheHelper.hashKey('test2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(CacheHelper.formatBytes(1024)).toBe('1 KB');
      expect(CacheHelper.formatBytes(1048576)).toBe('1 MB');
    });
  });

  describe('deepClone', () => {
    it('should create independent copy', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = CacheHelper.deepClone(original);
      
      cloned.b.c = 3;
      expect(original.b.c).toBe(2);
    });
  });
});
```

## Best Practices

1. **Use specific error types**: Always use specific error classes for better error handling
2. **Sanitize keys**: Always sanitize user-provided keys before use
3. **Clone when needed**: Deep clone cached values when immutability is required
4. **Format for display**: Use formatting utilities for user-facing output
5. **Validate patterns**: Validate regex patterns before use
6. **Handle errors gracefully**: Always catch and handle CacheError and its subclasses
7. **Log errors appropriately**: Log error details for debugging while protecting sensitive data

## Performance Considerations

### Hash Performance

```typescript
// O(n) where n is key length
const hash = CacheHelper.hashKey(key);
```

### Clone Performance

```typescript
// O(m) where m is object complexity
const cloned = CacheHelper.deepClone(obj);
```

**Optimization**: For simple values, direct assignment may be faster than deep clone.

## Integration Examples

### With Cache Service

```typescript
import { CacheHelper, CacheKeyError } from '../utils';

class EnhancedCacheService<T> extends CacheService<T> {
  set(key: string, value: T, ttl?: number): void {
    const sanitizedKey = CacheHelper.sanitizeKey(key);
    super.set(sanitizedKey, value, ttl);
  }

  get(key: string): CacheResult<T> {
    const sanitizedKey = CacheHelper.sanitizeKey(key);
    return super.get(sanitizedKey);
  }
}
```

### With Statistics

```typescript
import { CacheHelper } from '../utils';

class CacheStatistics {
  private operations: Map<string, number> = new Map();

  recordOperation(operation: string, duration: number): void {
    const formattedDuration = CacheHelper.formatDuration(duration);
    console.log(`${operation} took ${formattedDuration}`);
  }
}
```

## Troubleshooting

### Hash Collisions

**Problem**: Different keys produce same hash

**Solution**: Hash collisions are rare but possible. Use full key for final comparison.

### Clone Performance

**Problem**: Deep cloning is slow for large objects

**Solution**: Consider shallow clone or immutability patterns for better performance

### Key Sanitization

**Problem**: Sanitized keys lose meaning

**Solution**: Use namespace prefixes to maintain key semantics
