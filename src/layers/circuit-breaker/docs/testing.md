# Testing Strategy

## Overview
The Circuit Breaker Layer follows a comprehensive testing strategy to ensure correctness, state management, and performance of circuit breaker functionality. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **ICircuitBreaker Interface**: 100% (type validation)
- **CircuitBreaker Implementation**: 99%+
- **State Manager**: 99%+
- **Failure Handler**: 99%+
- **Fallback Executor**: 99%+
- **Statistics Tracker**: 99%+

## Unit Tests

### Test Organization
```
src/layers/circuit-breaker/__tests__/
├── unit/
│   ├── states/
│   │   ├── state-manager.test.ts
│   │   └── state-machine.test.ts
│   ├── failure/
│   │   ├── failure-handler.test.ts
│   │   └── timeout-manager.test.ts
│   ├── fallback/
│   │   ├── fallback-executor.test.ts
│   │   └── fallback-manager.test.ts
│   ├── statistics/
│   │   └── statistics-tracker.test.ts
│   └── circuit-breaker.test.ts
```

### Unit Test Categories

#### 1. State Manager Tests
```typescript
describe('State Manager', () => {
  it('should transition from closed to open', () => {
    const manager = new CircuitStateManager();
    
    manager.transitionTo(CircuitState.OPEN, 'Failure threshold exceeded');
    
    expect(manager.getState()).toBe(CircuitState.OPEN);
  });

  it('should transition from open to half-open', () => {
    const manager = new CircuitStateManager(CircuitState.OPEN);
    
    manager.transitionTo(CircuitState.HALF_OPEN, 'Attempting recovery');
    
    expect(manager.getState()).toBe(CircuitState.HALF_OPEN);
  });

  it('should prevent invalid transitions', () => {
    const manager = new CircuitStateManager();
    
    expect(() => manager.transitionTo(CircuitState.HALF_OPEN, 'Invalid')).toThrow();
  });
});
```

#### 2. Failure Handler Tests
```typescript
describe('Failure Handler', () => {
  it('should record failures', () => {
    const handler = new FailureHandler(3, 60000);
    
    handler.recordFailure();
    handler.recordFailure();
    
    expect(handler.getFailureCount()).toBe(2);
  });

  it('should open circuit when threshold exceeded', () => {
    const handler = new FailureHandler(3, 60000);
    
    handler.recordFailure();
    handler.recordFailure();
    handler.recordFailure();
    
    expect(handler.shouldOpenCircuit()).toBe(true);
  });

  it('should reset on success', () => {
    const handler = new FailureHandler(3, 60000);
    handler.recordFailure();
    handler.recordSuccess();
    
    expect(handler.getFailureCount()).toBe(0);
  });
});
```

#### 3. Fallback Executor Tests
```typescript
describe('Fallback Executor', () => {
  it('should execute fallback function', async () => {
    const config = {
      fallback: () => 'fallback value',
      executeOnError: true,
      executeOnOpen: true
    };
    const executor = new FallbackExecutor(config);
    
    const result = await executor.execute();
    
    expect(result).toBe('fallback value');
  });

  it('should handle fallback errors', async () => {
    const config = {
      fallback: () => { throw new Error('Fallback failed'); },
      executeOnError: true,
      executeOnOpen: true
    };
    const executor = new FallbackExecutor(config);
    
    await expect(executor.execute()).rejects.toThrow(FallbackError);
  });
});
```

## Integration Tests

### Full Circuit Breaker Integration Tests
```typescript
describe('Circuit Breaker Integration', () => {
  it('should open circuit after failures', async () => {
    const breaker = createCircuitBreaker();
    
    for (let i = 0; i < 5; i++) {
      await breaker.execute(() => { throw new Error('Service error'); });
    }
    
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('should execute fallback on failure', async () => {
    const breaker = createCircuitBreaker();
    const fallback = jest.fn(() => 'fallback');
    
    breaker.registerFallback('default', { fallback, executeOnError: true, executeOnOpen: true });
    
    const result = await breaker.execute(() => { throw new Error('Service error'); });
    
    expect(result).toBe('fallback');
    expect(fallback).toHaveBeenCalled();
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should handle high request rate', async () => {
    const breaker = createCircuitBreaker();
    const start = Date.now();
    
    const promises = Array(1000).fill(null).map(() =>
      breaker.execute(() => 'success')
    );
    
    await Promise.all(promises);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // < 1s for 1000 requests
  });

  it('should track statistics efficiently', () => {
    const tracker = new CircuitStatisticsTracker();
    const start = Date.now();
    
    for (let i = 0; i < 10000; i++) {
      if (i % 2 === 0) {
        tracker.recordSuccess();
      } else {
        tracker.recordFailure();
      }
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 10000 records
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createCircuitBreaker(): CircuitBreaker {
  const config = {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeout: 60000,
    timeout: 5000
  };
  return new CircuitBreaker(config);
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/circuit-breaker
```

### Integration Tests
```bash
npm run test:integration -- src/layers/circuit-breaker
```

### Performance Tests
```bash
npm run test:performance -- src/layers/circuit-breaker
```

### All Tests
```bash
npm test -- src/layers/circuit-breaker
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/circuit-breaker
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Circuit Breaker Tests

on:
  pull_request:
    paths:
      - 'src/layers/circuit-breaker/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/circuit-breaker
      - run: npm run test:integration -- src/layers/circuit-breaker
      - run: npm run test:performance -- src/layers/circuit-breaker
      - run: npm run test:coverage -- src/layers/circuit-breaker
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all state transitions
- Test failure handling
- Test fallback execution
- Test statistics tracking
- Maintain test independence

### Performance Testing Guidelines
- Test with high request rates
- Monitor state transition overhead
- Test fallback execution performance
