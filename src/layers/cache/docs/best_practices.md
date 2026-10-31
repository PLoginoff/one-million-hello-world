# Cache Layer Best Practices

## General Principles

### Choose the Right Cache Type
- `CacheFactory.createHighPerformance()` — L1, hot data, low latency.
- `CacheFactory.create({ maxSize, defaultTTL })` — L2, warm data.
- `CacheFactory.createLargeCache()` — L3, cold data.
- Combine them for multi-tier caching (see `multi-level-caching.md`).

### Set Appropriate TTL
- Static content: 1–24 h. Dynamic content: 1–10 min. Session data: 30–60 min. Real-time: <1 min or skip caching.
- Avoid extremes: `1000` ms causes churn; `86400000` on dynamic data goes stale.

### Choose the Right Eviction Strategy
- `InvalidationStrategy.LRU` — temporal locality (web pages, API responses, DB queries).
- `InvalidationStrategy.LFU` — frequency (popular content, static assets, config).
- `InvalidationStrategy.MANUAL`/FIFO — predictable eviction (log buffers, queues).

### Use Namespaces
Prefix keys: `user:123:name`, `product:456:details`. Benefits: pattern invalidation (`user:123:*`), clear structure, no collisions.

### Handle Cache Misses Gracefully
Always check `result.hit` before reading `result.value` — it is `undefined` on a miss. On miss, fetch and populate.

### Monitor Cache Performance
Poll `cache.getStats()` periodically; alert when `getHitRate() < 0.5` and consider resizing.

## Configuration

- Prefer `CacheFactory.create*` over `new CacheManager()` so presets stay consistent.
- Use `CacheConfigBuilder` for complex configs instead of hand-built option objects.
- Validate with `CacheConfigValidator.validate(config)` before constructing.
- Pick environment-specific presets, e.g. `DefaultConfigs.LARGE_CACHE` in production vs `DefaultConfigs.HIGH_PERFORMANCE` in dev.

## Key Management

- Consistent format: `entity:id:field` (`user:123:profile`). Avoid mixing `user_123`, `user-123`, `user123`.
- Sanitize user input: `CacheHelper.sanitizeKey('user:' + userId)`.
- Version keys (`v1:user:123`) so schema changes can invalidate a whole generation.

## Invalidation

- Group related keys so `cache.invalidate('user:123:*')` clears one entity's data.
- Always invalidate when the underlying data changes (write → invalidate).
- Prefer `InvalidationStrategy.TIME_BASED` + TTL for naturally expiring data.

## Memory Management

- Size the cache from available memory: `maxSize ≈ (totalmem * 0.1) / avgEntrySize`.
- Alert when `stats.size / maxSize > 0.9`.
- Use multi-tier caching so cold data doesn't occupy L1 memory.

## Performance

- Cache hot data: warm the cache with popular items on startup.
- Batch `get` calls (`keys.map(k => cache.get(k))`) instead of one-by-one round-trips in loops.
- Prefetch related data (`Promise.all`) and store it under derived keys.
- Keep cached values small — store summaries/IDs, not whole large responses.

## Error Handling

- Catch specific errors: `CacheKeyError`, `CacheConfigError`, `CacheStorageError`.
- Fall back to the source on cache failure — a cache miss path should never take the request down.
- Log errors with key + stack; never swallow exceptions silently.

## Testing

- Cover store/get, TTL expiry (`set` → `sleep` → miss), pattern `invalidate`, and error paths (`set('', v)` → `CacheKeyError`).

## Security

- Sanitize all user-controlled key fragments.
- Validate keys via `CacheValidationService.validateKey`.
- Never cache secrets (passwords, tokens); cache only non-sensitive payloads.

## Monitoring

- Track `hits`, `misses`, `evictions`, `size`, `getHitRate()` — export them with a timestamp for analysis.
- Alert on low hit rate, high eviction rate, and near-full size.

## Anti-Patterns

- **Don't cache everything** — gate with a `shouldCache(key)` predicate.
- **Don't use long TTLs for dynamic data** — minutes, not days.
- **Don't ignore errors** — log + fallback, never silent catch.
- **Don't cache large objects** — cache the minimal field set.

## Checklist

- [ ] Right cache type (L1/L2/L3) and eviction strategy for the access pattern
- [ ] TTL matched to data freshness requirements
- [ ] Consistent, namespaced, versioned, sanitized keys
- [ ] Graceful miss handling and source fallback
- [ ] Config built via `CacheConfigBuilder`/`CacheFactory` and validated
- [ ] Pattern invalidation wired to data writes
- [ ] Metrics exported; alerts on hit rate/size
- [ ] No sensitive data; no indiscriminate caching
