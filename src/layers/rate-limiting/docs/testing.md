# Testing Strategy

## Overview
Rate Limiting Layer tests exercise `RateLimiter` (`IRateLimiter`), its strategies, rules/exceptions/tiers/quotas, statistics, health, and diagnostics. Tests use `bun:test` and live in `src/layers/rate-limiting/__tests__/`.

## Coverage Targets

- Minimum 95%, target 99%+; branch 90%+, functions 100%.
- `RateLimiter` + strategies + rules/exceptions/tiers/quotas/statistics: 99%+; health/diagnostics: 95%+.

## Test Organization

```
src/layers/rate-limiting/__tests__/
├── RateLimiter.test.ts                  # core checkRateLimit paths
├── RateLimiter.advanced.test.ts         # extended checks, internal layers
├── RateLimiter.edge-cases.test.ts
├── RateLimiter.integration.test.ts
├── RateLimitingStrategies.test.ts       # token bucket / sliding / fixed / leaky
├── RateLimitingMetricsStrategy.test.ts
├── RateLimitingLoggingStrategy.test.ts
├── RateLimitingTypes.test.ts
├── RateLimitingConfiguration.test.ts
├── RateLimitingErrors.test.ts
├── RateLimitErrorMapper.test.ts
├── RateLimitingHealthCheck.test.ts
├── RateLimitingMetricsCollector.test.ts
└── RateLimitingRedisAdapter.test.ts
```

## Unit Test Examples

### Rate Limit Checks

```typescript
it('allows requests under the limit and denies over it', () => {
  limiter.setRateLimitConfig({ maxRequests: 5, windowMs: 60000 });
  for (let i = 0; i < 5; i++) {
    expect(limiter.checkRateLimit(request).allowed).toBe(true);
  }
  expect(limiter.checkRateLimit(request).allowed).toBe(false);
});
```

### Strategies

Cover `checkSlidingWindow`, `checkFixedWindow`, `checkLeakyBucket` and the default token-bucket path via `checkRateLimit`. Assert `allowed`, `remaining`, `resetTime`, and refill after `windowMs`/`retryDelay` (`await sleep`).

### Rules / Exceptions / Tiers / Quotas

```typescript
it('applies matching rule, skips non-matching', () => {
  limiter.addRateLimitRule({ id: 'r1', name: 'api', priority: 1,
    scope: RateLimitScope.PER_IP, maxRequests: 5, windowMs: 60000,
    strategy: RateLimitStrategy.TOKEN_BUCKET, enabled: true });
  expect(limiter.getApplicableRule(identifier)?.id).toBe('r1');
});

it('exception bypasses limits', () => {
  limiter.addRateLimitException({ id: 'e1', identifier: '1.2.3.4', type: 'temporary',
    expiresAt: new Date(Date.now() + 3600000), reason: 'test',
    createdAt: new Date(), createdBy: 'test' });
  expect(limiter.hasException(identifier)).toBe(true);
});

it('tier override applies its own limits', () => {
  limiter.setRateLimitTier(identifier, tier);
  expect(limiter.getRateLimitTier(identifier)).toEqual(tier);
});

it('quota exhaustion denies', () => {
  limiter.setQuota(identifier, quota);
  // drive usage until getUsageByIdentifier shows quota consumed
});
```

### Statistics / Health / Diagnostics

```typescript
limiter.getStats();            // totalRequests/allowed/denied/currentBuckets
limiter.getBucketInfo(id);     // per-id bucket state
limiter.getHealthStatus();     // status + score + checks
limiter.runDiagnostics();      // traceId, steps, summary
limiter.getWarnings();         // threshold warnings
```

## Integration Tests
`RateLimiter.integration.test.ts` covers end-to-end `checkRateLimit`/`checkRateLimitExtended` with rules + exceptions + tiers active, internal-layer limits, and error mapping.

## Performance Tests
- Single `checkRateLimit` completes in ~1 ms.
- 10k sequential/concurrent checks stay under ~1 s; many distinct identifiers (1k buckets) under ~500 ms.
- `cleanupExpiredBuckets` bounds `getBucketCount()` under load.

## Test Utilities

```typescript
function createRequest(overrides?: Partial<HttpRequest>): HttpRequest {
  return { method: HttpMethod.GET, uri: '/api/test', version: HttpVersion.HTTP_1_1,
    headers: new Map(), body: Buffer.alloc(0), remoteAddress: '192.168.1.1',
    securityContext: createSecurityContext(), ...overrides };
}
function createSecurityContext(overrides?): SecurityContext { /* userId, roles, ipAddress, userAgent, authenticationMethod, authenticatedAt */ }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
```

## Running Tests

```bash
bun test ./src/layers/rate-limiting/
bun test ./src/layers/rate-limiting/__tests__/RateLimiter.test.ts
bun test --coverage ./src/layers/rate-limiting/
```

## Best Practices

- Cover each strategy's boundary behavior (at-limit, over-limit, refill).
- Test rule priority ordering, condition operators, and disabled rules.
- Test exception expiry, tier resolution, quota reset.
- Assert stats/health/diagnostics after a known workload; keep tests independent (`resetStats`, `clearWarnings`, `clearAllBuckets`).
