# Testing Strategy

## Overview
The Rate Limiting Layer follows a comprehensive testing strategy to ensure correctness, performance, and reliability of rate limiting functionality. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IRateLimiter Interface**: 100% (type validation)
- **RateLimiter Implementation**: 99%+
- **Token Bucket Strategy**: 99%+
- **Sliding Window Strategy**: 99%+
- **Fixed Window Strategy**: 99%+
- **Leaky Bucket Strategy**: 99%+
- **Rule Engine**: 99%+
- **Exception Manager**: 99%+
- **Tier Manager**: 99%+
- **Statistics Collector**: 99%+
- **Health Checker**: 95%+

## Unit Tests

### Test Organization
```
src/layers/rate-limiting/__tests__/
├── unit/
│   ├── strategies/
│   │   ├── token-bucket.test.ts
│   │   ├── sliding-window.test.ts
│   │   ├── fixed-window.test.ts
│   │   └── leaky-bucket.test.ts
│   ├── identifiers/
│   │   ├── ip-based.test.ts
│   │   ├── user-id-based.test.ts
│   │   ├── api-key-based.test.ts
│   │   └── custom-identifier.test.ts
│   ├── rules/
│   │   ├── rule-engine.test.ts
│   │   ├── rule-manager.test.ts
│   │   └── rule-conditions.test.ts
│   ├── exceptions/
│   │   ├── exception-manager.test.ts
│   │   └── exception-aware-limiter.test.ts
│   ├── tiers/
│   │   ├── tier-manager.test.ts
│   │   └── tiered-limiter.test.ts
│   ├── quotas/
│   │   ├── quota-manager.test.ts
│   │   └── quota-tracker.test.ts
│   ├── statistics/
│   │   ├── statistics-collector.test.ts
│   │   ├── identifier-statistics.test.ts
│   │   └── metrics-collector.test.ts
│   ├── health/
│   │   ├── health-checker.test.ts
│   │   └── diagnostics.test.ts
│   └── rate-limiter.test.ts
```

### Unit Test Categories

#### 1. Token Bucket Strategy Tests
```typescript
describe('Token Bucket Strategy', () => {
  it('should allow requests when tokens available', async () => {
    const limiter = new TokenBucketRateLimiter(config);
    const result = await limiter.checkLimit('test-identifier');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('should deny requests when bucket empty', async () => {
    const config = { capacity: 5, refillRate: 1, windowMs: 1000 };
    const limiter = new TokenBucketRateLimiter(config);
    
    for (let i = 0; i < 5; i++) {
      await limiter.checkLimit('test-identifier');
    }
    
    const result = await limiter.checkLimit('test-identifier');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should refill tokens over time', async () => {
    const config = { capacity: 5, refillRate: 10, windowMs: 1000 };
    const limiter = new TokenBucketRateLimiter(config);
    
    // Consume all tokens
    for (let i = 0; i < 5; i++) {
      await limiter.checkLimit('test-identifier');
    }
    
    // Wait for refill
    await sleep(200);
    
    const result = await limiter.checkLimit('test-identifier');
    expect(result.allowed).toBe(true);
  });

  it('should handle burst capacity correctly', async () => {
    const config = { capacity: 10, refillRate: 1, windowMs: 1000 };
    const limiter = new TokenBucketRateLimiter(config);
    
    // Should allow burst up to capacity
    for (let i = 0; i < 10; i++) {
      const result = await limiter.checkLimit('test-identifier');
      expect(result.allowed).toBe(true);
    }
    
    // Next request should be denied
    const result = await limiter.checkLimit('test-identifier');
    expect(result.allowed).toBe(false);
  });
});
```

#### 2. Sliding Window Strategy Tests
```typescript
describe('Sliding Window Strategy', () => {
  it('should allow requests under limit', async () => {
    const config = { maxRequests: 10, windowMs: 60000 };
    const limiter = new SlidingWindowRateLimiter(config);
    
    for (let i = 0; i < 10; i++) {
      const result = await limiter.checkLimit('test-identifier');
      expect(result.allowed).toBe(true);
    }
  });

  it('should deny requests over limit', async () => {
    const config = { maxRequests: 5, windowMs: 60000 };
    const limiter = new SlidingWindowRateLimiter(config);
    
    for (let i = 0; i < 5; i++) {
      await limiter.checkLimit('test-identifier');
    }
    
    const result = await limiter.checkLimit('test-identifier');
    expect(result.allowed).toBe(false);
  });

  it('should slide window correctly', async () => {
    const config = { maxRequests: 5, windowMs: 100 };
    const limiter = new SlidingWindowRateLimiter(config);
    
    for (let i = 0; i < 5; i++) {
      await limiter.checkLimit('test-identifier');
    }
    
    // Wait for window to slide
    await sleep(150);
    
    const result = await limiter.checkLimit('test-identifier');
    expect(result.allowed).toBe(true);
  });
});
```

#### 3. Rule Engine Tests
```typescript
describe('Rule Engine', () => {
  it('should apply matching rule', async () => {
    const rule: RateLimitRule = {
      id: 'test-rule',
      name: 'Test Rule',
      priority: 1,
      scope: RateLimitScope.PER_IP,
      maxRequests: 10,
      windowMs: 60000,
      strategy: RateLimitStrategy.TOKEN_BUCKET,
      enabled: true
    };
    
    ruleEngine.addRule(rule);
    const result = await ruleEngine.evaluateRules(createTestRequest());
    
    expect(result.allowed).toBe(true);
  });

  it('should skip disabled rules', async () => {
    const rule: RateLimitRule = {
      id: 'test-rule',
      name: 'Test Rule',
      priority: 1,
      scope: RateLimitScope.PER_IP,
      maxRequests: 10,
      windowMs: 60000,
      strategy: RateLimitStrategy.TOKEN_BUCKET,
      enabled: false
    };
    
    ruleEngine.addRule(rule);
    const result = await ruleEngine.evaluateRules(createTestRequest());
    
    expect(result.allowed).toBe(true);
  });

  it('should evaluate rule conditions', async () => {
    const rule: RateLimitRule = {
      id: 'test-rule',
      name: 'Test Rule',
      priority: 1,
      scope: RateLimitScope.PER_IP,
      maxRequests: 10,
      windowMs: 60000,
      strategy: RateLimitStrategy.TOKEN_BUCKET,
      conditions: [
        {
          type: 'method',
          field: 'method',
          operator: 'equals',
          value: HttpMethod.GET
        }
      ],
      enabled: true
    };
    
    ruleEngine.addRule(rule);
    
    const getRequest = createTestRequest({ method: HttpMethod.GET });
    const getResult = await ruleEngine.evaluateRules(getRequest);
    expect(getResult.allowed).toBe(true);
    
    const postRequest = createTestRequest({ method: HttpMethod.POST });
    const postResult = await ruleEngine.evaluateRules(postRequest);
    expect(postResult.allowed).toBe(false); // Rule doesn't match, uses default
  });
});
```

#### 4. Exception Manager Tests
```typescript
describe('Exception Manager', () => {
  it('should allow request with exception', async () => {
    const exception: RateLimitException = {
      id: 'test-exception',
      identifier: '192.168.1.100',
      type: 'temporary',
      expiresAt: new Date(Date.now() + 3600000),
      reason: 'Test exception',
      createdAt: new Date(),
      createdBy: 'test'
    };
    
    exceptionManager.addException(exception);
    
    const hasException = exceptionManager.hasException('192.168.1.100');
    expect(hasException).toBe(true);
  });

  it('should expire temporary exceptions', async () => {
    const exception: RateLimitException = {
      id: 'test-exception',
      identifier: '192.168.1.100',
      type: 'temporary',
      expiresAt: new Date(Date.now() + 100), // Expires in 100ms
      reason: 'Test exception',
      createdAt: new Date(),
      createdBy: 'test'
    };
    
    exceptionManager.addException(exception);
    expect(exceptionManager.hasException('192.168.1.100')).toBe(true);
    
    await sleep(150);
    expect(exceptionManager.hasException('192.168.1.100')).toBe(false);
  });

  it('should keep permanent exceptions', async () => {
    const exception: RateLimitException = {
      id: 'test-exception',
      identifier: '192.168.1.100',
      type: 'permanent',
      reason: 'Test exception',
      createdAt: new Date(),
      createdBy: 'test'
    };
    
    exceptionManager.addException(exception);
    
    await sleep(1000);
    expect(exceptionManager.hasException('192.168.1.100')).toBe(true);
  });
});
```

#### 5. Tier Manager Tests
```typescript
describe('Tier Manager', () => {
  it('should resolve matching tier', async () => {
    const tier: RateLimitTier = {
      id: 'premium',
      name: 'Premium',
      priority: 10,
      maxRequests: 1000,
      windowMs: 60000,
      features: ['unlimited'],
      conditions: [
        {
          type: 'user_role',
          field: 'role',
          operator: 'equals',
          value: 'premium'
        }
      ]
    };
    
    tierManager.addTier(tier);
    
    const request = createTestRequest({
      securityContext: createSecurityContext({ roles: ['premium'] })
    });
    
    const resolvedTier = await tierManager.resolveTier(request);
    expect(resolvedTier).not.toBeNull();
    expect(resolvedTier?.id).toBe('premium');
  });

  it('should return null when no tier matches', async () => {
    const tier: RateLimitTier = {
      id: 'premium',
      name: 'Premium',
      priority: 10,
      maxRequests: 1000,
      windowMs: 60000,
      features: ['unlimited'],
      conditions: [
        {
          type: 'user_role',
          field: 'role',
          operator: 'equals',
          value: 'premium'
        }
      ]
    };
    
    tierManager.addTier(tier);
    
    const request = createTestRequest({
      securityContext: createSecurityContext({ roles: ['user'] })
    });
    
    const resolvedTier = await tierManager.resolveTier(request);
    expect(resolvedTier).toBeNull();
  });
});
```

#### 6. Statistics Tests
```typescript
describe('Statistics Collector', () => {
  it('should record requests correctly', () => {
    const collector = new StatisticsCollector();
    
    collector.recordRequest(true);
    collector.recordRequest(true);
    collector.recordRequest(false, 'rate_limit_exceeded');
    
    const stats = collector.getStatistics();
    
    expect(stats.totalRequests).toBe(3);
    expect(stats.allowedRequests).toBe(2);
    expect(stats.deniedRequests).toBe(1);
    expect(stats.deniedByReason.get('rate_limit_exceeded')).toBe(1);
  });

  it('should calculate request rate correctly', () => {
    const collector = new StatisticsCollector();
    
    for (let i = 0; i < 10; i++) {
      collector.recordRequest(true);
    }
    
    await sleep(1000);
    
    const stats = collector.getStatistics();
    expect(stats.averageRequestRate).toBeGreaterThan(0);
  });

  it('should reset statistics correctly', () => {
    const collector = new StatisticsCollector();
    
    collector.recordRequest(true);
    collector.recordRequest(false);
    
    collector.resetStatistics();
    
    const stats = collector.getStatistics();
    
    expect(stats.totalRequests).toBe(0);
    expect(stats.allowedRequests).toBe(0);
    expect(stats.deniedRequests).toBe(0);
  });
});
```

## Integration Tests

### Full Pipeline Tests
```typescript
describe('Rate Limiting Pipeline Integration', () => {
  it('should process request through full pipeline', async () => {
    const request = createTestRequest();
    const result = await rateLimiter.processRequest(request);
    
    expect(result).toBeDefined();
    expect(result.allowed).toBeDefined();
  });

  it('should apply rule-based rate limiting', async () => {
    const rule: RateLimitRule = {
      id: 'test-rule',
      name: 'Test Rule',
      priority: 1,
      scope: RateLimitScope.PER_IP,
      maxRequests: 5,
      windowMs: 60000,
      strategy: RateLimitStrategy.TOKEN_BUCKET,
      conditions: [
        {
          type: 'path',
          field: 'uri',
          operator: 'equals',
          value: '/api/test'
        }
      ],
      enabled: true
    };
    
    ruleEngine.addRule(rule);
    
    const request = createTestRequest({ uri: '/api/test' });
    
    for (let i = 0; i < 5; i++) {
      const result = await rateLimiter.processRequest(request);
      expect(result.allowed).toBe(true);
    }
    
    const result = await rateLimiter.processRequest(request);
    expect(result.allowed).toBe(false);
  });

  it('should handle exceptions correctly', async () => {
    const exception: RateLimitException = {
      id: 'test-exception',
      identifier: '192.168.1.100',
      type: 'temporary',
      expiresAt: new Date(Date.now() + 3600000),
      reason: 'Test exception',
      createdAt: new Date(),
      createdBy: 'test'
    };
    
    exceptionManager.addException(exception);
    
    const request = createTestRequest({ remoteAddress: '192.168.1.100' });
    
    for (let i = 0; i < 100; i++) {
      const result = await rateLimiter.processRequest(request);
      expect(result.allowed).toBe(true);
    }
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should check limit within time limit', async () => {
    const limiter = new TokenBucketRateLimiter(config);
    const start = Date.now();
    
    await limiter.checkLimit('test-identifier');
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1); // < 1ms
  });

  it('should handle high request rate', async () => {
    const limiter = new TokenBucketRateLimiter(config);
    const requests = Array(10000).fill(null).map(() => 'test-identifier');
    
    const start = Date.now();
    
    await Promise.all(requests.map(id => limiter.checkLimit(id)));
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // < 1s for 10k requests
  });

  it('should maintain performance with many buckets', async () => {
    const limiter = new TokenBucketRateLimiter(config);
    const identifiers = Array(1000).fill(null).map((_, i) => `identifier-${i}`);
    
    const start = Date.now();
    
    await Promise.all(identifiers.map(id => limiter.checkLimit(id)));
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500); // < 500ms for 1k buckets
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
class MockRateLimiter implements IRateLimiter {
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    return { allowed: true, remaining: 100, resetTime: new Date() };
  }
}

function createTestRequest(overrides?: Partial<HttpRequest>): HttpRequest {
  return {
    method: HttpMethod.GET,
    uri: '/api/test',
    version: HttpVersion.HTTP_1_1,
    headers: new Map(),
    body: Buffer.alloc(0),
    remoteAddress: '192.168.1.1',
    securityContext: createSecurityContext(),
    ...overrides
  };
}

function createSecurityContext(overrides?: Partial<SecurityContext>): SecurityContext {
  return {
    userId: 'test-user',
    roles: ['user'],
    permissions: [],
    ipAddress: '192.168.1.1',
    userAgent: 'test-agent',
    authenticationMethod: AuthenticationMethod.BEARER_TOKEN,
    authenticatedAt: new Date(),
    metadata: new Map(),
    ...overrides
  };
}
```

### Test Helpers
```typescript
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createConfig(overrides?: Partial<RateLimitConfig>): RateLimitConfig {
  return {
    maxRequests: 100,
    windowMs: 60000,
    strategy: RateLimitStrategy.TOKEN_BUCKET,
    ...overrides
  };
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/rate-limiting
```

### Integration Tests
```bash
npm run test:integration -- src/layers/rate-limiting
```

### Performance Tests
```bash
npm run test:performance -- src/layers/rate-limiting
```

### All Tests
```bash
npm test -- src/layers/rate-limiting
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/rate-limiting
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Rate Limiting Tests

on:
  pull_request:
    paths:
      - 'src/layers/rate-limiting/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/rate-limiting
      - run: npm run test:integration -- src/layers/rate-limiting
      - run: npm run test:performance -- src/layers/rate-limiting
      - run: npm run test:coverage -- src/layers/rate-limiting
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all rate limiting strategies
- Test edge cases (boundary conditions, zero limits)
- Test rule evaluation with various conditions
- Test exception expiration and cleanup
- Test tier resolution and selection
- Test statistics accuracy
- Test health check scenarios
- Test diagnostic execution
- Maintain test independence

### Performance Testing Guidelines
- Test with realistic request volumes
- Test with high bucket counts
- Test memory usage under load
- Test latency characteristics
- Test cleanup efficiency
- Test concurrent access patterns
