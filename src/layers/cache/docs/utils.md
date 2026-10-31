# Utils Layer Documentation

## Overview

Utility functions and custom error classes used across the Cache Layer. `utils/errors/CacheError.ts` holds the error hierarchy; `utils/helpers/CacheHelper.ts` holds static helpers.

## Error Classes

All errors extend `CacheError`. Catch specific subclasses for targeted handling.

- **`CacheError`** — base class for all cache errors.
- **`CacheKeyError`** — invalid/empty/over-long key, illegal characters.
- **`CacheConfigError`** — invalid or missing configuration.
- **`CacheStorageError`** — storage read/write/capacity/connection failures.
- **`CacheEvictionError`** — eviction strategy failures, nothing evictable, deadlock.

```typescript
try {
  cache.set('key', 'value');
} catch (error) {
  if (error instanceof CacheKeyError) console.error('Key error:', error.message);
  else if (error instanceof CacheStorageError) console.error('Storage error:', error.message);
  else if (error instanceof CacheError) console.error('Cache error:', error.message);
  else throw error;
}
```

## Helper Functions (`CacheHelper`)

- `hashKey(key: string): number` — deterministic hash for sharding/distribution (`hash % shardCount`).
- `isExpired(entry, currentTime?)` — TTL check on a `CacheEntry`.
- `formatBytes(bytes)` — `1024 → '1 KB'`, `1048576 → '1 MB'`.
- `formatDuration(ms)` — `500 → '500ms'`, `1500 → '1.5s'`, `90000 → '1.5m'`, `7200000 → '2.0h'`.
- `deepClone<T>(obj): T` — deep copy; return clones from `get` to prevent cache pollution.
- `sanitizeKey(key)` — replaces invalid characters (`'user@123#456' → 'user_123_456'`).
- `isValidPattern(pattern)` — validates a regex invalidation pattern.

```typescript
const shard = CacheHelper.hashKey('user:12345') % shardCount;
const safe = CacheHelper.sanitizeKey(userInput);
const clone = CacheHelper.deepClone(result.value);
```

## Patterns

### Key Namespacing

```typescript
const userKey = `user:${id}`;
cache.invalidate('user:*'); // namespace-wide invalidation
```

### Sanitized Access Wrapper

```typescript
class SafeCache<T> {
  constructor(private cache: CacheManager<T>) {}
  set(key: string, value: T, ttl?: number) {
    this.cache.set(CacheHelper.sanitizeKey(key), value, ttl);
  }
  get(key: string) {
    return this.cache.get(CacheHelper.sanitizeKey(key));
  }
}
```

## Best Practices

- Use specific error types, not generic `Error`.
- Sanitize user-provided keys before `set`/`get`.
- `deepClone` cached objects when callers may mutate them.
- `isValidPattern` before `invalidate`.
- Log errors with context; don't leak sensitive values into logs.

## Performance

- `hashKey` is O(key length); `deepClone` is O(object size) — prefer shallow copies for flat values.

## Troubleshooting

- **Hash collisions** — use the full key for the final comparison.
- **Clone cost on large objects** — shallow-clone or store immutable values.
- **Sanitization loses readability** — keep a namespace prefix to preserve semantics.
