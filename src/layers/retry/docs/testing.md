# Testing Strategy

## Overview
The Retry Layer follows a comprehensive testing strategy to ensure correctness, retry behavior, and performance of retry functionality. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IRetryPolicy Interface**: 100% (type validation)
- **RetryPolicy Implementation**: 99%+
- **Strategy Selector**: 99%+
- **Delay Calculator**: 99%+
- **Jitter Calculator**: 99%+
- **Attempt Manager**: 99%+

## Unit Tests

### Test Organization
```
src/layers/retry/__tests__/
├── unit/
│   ├── strategies/
│   │   ├── exponential-backoff.test.ts
│   │   ├── fixed-delay.test.ts
│   │   ├── linear-backoff.test.ts
│   │   └── strategy-selector.test.ts
│   ├── delay/
│   │   └── delay-calculator.test.ts
│   ├── jitter/
│   │   └── jitter-calculator.test.ts
│   ├── attempts/
│   │   ├── attempt-manager.test.ts
│   │   └── retry-executor.test.ts
│   └── retry-policy.test.ts
```

### Unit Test Categories

#### 1. Strategy Selector Tests
```typescript
describe('Strategy Selector', () => {
  it('should calculate exponential backoff delay', () => {
    const selector = new StrategySelector();
    const config = {
      strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
      baseDelay: 100,
      maxDelay: 10000,
      multiplier: 2
    };
    
    const delay = selector.calculateDelay(2, config);
    
    expect(delay).toBe(400); // 100 * 2^2
  });

  it('should respect max delay cap', () => {
    const selector = new StrategySelector();
    const config = {
      strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
      baseDelay: 100,
      maxDelay: 500,
      multiplier: 2
    };
    
    const delay = selector.calculateDelay(10, config);
    
    expect(delay).toBe(500); // Capped at max delay
  });
});
```

#### 2. Jitter Calculator Tests
```typescript
describe('Jitter Calculator', () => {
  it('should apply jitter to delay', () => {
    const config = { enabled: true, percentage: 10 };
    const calculator = new JitterCalculator(config);
    
    const jittered = calculator.apply(100);
    
    expect(jittered).toBeGreaterThanOrEqual(90);
    expect(jittered).toBeLessThanOrEqual(110);
  });

  it('should return original delay when disabled', () => {
    const config = { enabled: false, percentage: 10 };
    const calculator = new JitterCalculator(config);
    
    const jittered = calculator.apply(100);
    
    expect(jittered).toBe(100);
  });
});
```

#### 3. Attempt Manager Tests
```typescript
describe('Attempt Manager', () => {
  it('should track attempts', () => {
    const manager = new AttemptManager(3);
    
    manager.increment();
    manager.increment();
    
    expect(manager.getCount()).toBe(2);
  });

  it('should check remaining attempts', () => {
    const manager = new AttemptManager(3);
    
    expect(manager.hasAttemptsRemaining()).toBe(true);
    
    manager.increment();
    manager.increment();
    manager.increment();
    
    expect(manager.hasAttemptsRemaining()).toBe(false);
  });
});
```

## Integration Tests

### Full Retry Integration Tests
```typescript
describe('Retry Integration', () => {
  it('should retry on failure', async () => {
    const retry = createRetryPolicy();
    let attempts = 0;
    
    await retry.execute(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Service error');
      return 'success';
    });
    
    expect(attempts).toBe(3);
  });

  it('should fail after max attempts', async () => {
    const retry = createRetryPolicy();
    
    await expect(retry.execute(() => { throw new Error('Service error'); })).rejects.toThrow();
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should calculate delays efficiently', () => {
    const selector = new StrategySelector();
    const config = {
      strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
      baseDelay: 100,
      maxDelay: 10000,
      multiplier: 2
    };
    const start = Date.now();
    
    for (let i = 0; i < 10000; i++) {
      selector.calculateDelay(i, config);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 10000 calculations
  });

  it('should apply jitter efficiently', () => {
    const calculator = new JitterCalculator({ enabled: true, percentage: 10 });
    const start = Date.now();
    
    for (let i = 0; i < 10000; i++) {
      calculator.apply(100);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 10000 jitter applications
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createRetryPolicy(): RetryPolicy {
  const config = {
    maxAttempts: 3,
    strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
    baseDelay: 100,
    maxDelay: 10000,
    multiplier: 2,
    jitter: { enabled: true, percentage: 10 }
  };
  return new RetryPolicy(config);
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/retry
```

### Integration Tests
```bash
npm run test:integration -- src/layers/retry
```

### Performance Tests
```bash
npm run test:performance -- src/layers/retry
```

### All Tests
```bash
npm test -- src/layers/retry
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/retry
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Retry Tests

on:
  pull_request:
    paths:
      - 'src/layers/retry/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/retry
      - run: npm run test:integration -- src/layers/retry
      - run: npm run test:performance -- src/layers/retry
      - run: npm run test:coverage -- src/layers/retry
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all retry strategies
- Test delay calculations
- Test jitter application
- Test attempt management
- Maintain test independence

### Performance Testing Guidelines
- Test with high attempt counts
- Monitor delay calculation overhead
- Test jitter performance
