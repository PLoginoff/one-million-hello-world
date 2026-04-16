# Testing Strategy

## Overview
The Service Layer follows a comprehensive testing strategy to ensure correctness, error handling, and performance of business logic functionality. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IService Interface**: 100% (type validation)
- **Service Implementation**: 99%+
- **Use Case Registry**: 99%+
- **Context Builder**: 99%+
- **Result Handler**: 99%+
- **Error Handler**: 99%+

## Unit Tests

### Test Organization
```
src/layers/service/__tests__/
├── unit/
│   ├── use-cases/
│   │   ├── use-case-registry.test.ts
│   │   ├── use-case-executor.test.ts
│   │   └── use-case-examples.test.ts
│   ├── context/
│   │   ├── context-builder.test.ts
│   │   ├── context-validator.test.ts
│   │   └── context-propagator.test.ts
│   ├── results/
│   │   ├── result-handler.test.ts
│   │   ├── result-mapper.test.ts
│   │   └── result-aggregator.test.ts
│   ├── error-handling/
│   │   ├── error-handler.test.ts
│   │   ├── retry-strategy.test.ts
│   │   └── circuit-breaker.test.ts
│   └── service.test.ts
```

### Unit Test Categories

#### 1. Use Case Registry Tests
```typescript
describe('Use Case Registry', () => {
  it('should register use case', () => {
    const registry = new UseCaseRegistry();
    const useCase = new TestUseCase();
    
    registry.register(useCase);
    
    expect(registry.has('testUseCase')).toBe(true);
    expect(registry.get('testUseCase')).toBe(useCase);
  });

  it('should unregister use case', () => {
    const registry = new UseCaseRegistry();
    const useCase = new TestUseCase();
    
    registry.register(useCase);
    registry.unregister('testUseCase');
    
    expect(registry.has('testUseCase')).toBe(false);
  });

  it('should return all use cases', () => {
    const registry = new UseCaseRegistry();
    
    registry.register(new TestUseCase('op1'));
    registry.register(new TestUseCase('op2'));
    
    const allUseCases = registry.getAll();
    expect(allUseCases.size).toBe(2);
  });
});
```

#### 2. Context Builder Tests
```typescript
describe('Context Builder', () => {
  it('should build context from controller context', () => {
    const builder = new ServiceContextBuilder();
    const controllerContext = createControllerContext();
    
    const context = builder.build(controllerContext);
    
    expect(context.requestId).toBe(controllerContext.requestId);
    expect(context.correlationId).toBe(controllerContext.correlationId);
    expect(context.traceId).toBe(controllerContext.traceId);
    expect(context.userId).toBe(controllerContext.userId);
  });

  it('should generate IDs when not provided', () => {
    const builder = new ServiceContextBuilder();
    const controllerContext = createControllerContext({
      requestId: undefined,
      correlationId: undefined,
      traceId: undefined
    });
    
    const context = builder.build(controllerContext);
    
    expect(context.requestId).toBeDefined();
    expect(context.correlationId).toBeDefined();
    expect(context.traceId).toBeDefined();
  });
});
```

#### 3. Result Handler Tests
```typescript
describe('Result Handler', () => {
  it('should call success callback on success', () => {
    const result = ServiceResult.success({ message: 'Success' });
    let called = false;
    
    ResultHandler.onSuccess(result, (data) => {
      called = true;
      expect(data.message).toBe('Success');
    });
    
    expect(called).toBe(true);
  });

  it('should call failure callback on failure', () => {
    const result = ServiceResult.failure({ code: 'ERROR', message: 'Error' });
    let called = false;
    
    ResultHandler.onFailure(result, (error) => {
      called = true;
      expect(error.code).toBe('ERROR');
    });
    
    expect(called).toBe(true);
  });
});
```

#### 4. Error Handler Tests
```typescript
describe('Error Handler', () => {
  it('should handle service error', () => {
    const handler = new ServiceErrorHandler();
    const error = new ServiceError('Test error', 'TEST_ERROR');
    const context = createServiceContext();
    
    const result = handler.handle(error, context);
    
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TEST_ERROR');
  });

  it('should convert generic error to service error', () => {
    const handler = new ServiceErrorHandler();
    const error = new Error('Generic error');
    const context = createServiceContext();
    
    const result = handler.handle(error, context);
    
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ServiceErrorCode.INTERNAL_ERROR);
  });
});
```

#### 5. Retry Strategy Tests
```typescript
describe('Retry Strategy', () => {
  it('should retry on retryable error', async () => {
    const config: RetryConfig = {
      maxRetries: 3,
      backoffMs: 10,
      retryableErrors: ['TRANSIENT_ERROR']
    };
    const strategy = new RetryStrategy(config);
    let attempts = 0;
    
    const operation = async () => {
      attempts++;
      if (attempts < 2) {
        const error = new ServiceError('Transient error', 'TRANSIENT_ERROR');
        throw error;
      }
      return 'success';
    };
    
    const result = await strategy.execute(operation);
    
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  it('should not retry on non-retryable error', async () => {
    const config: RetryConfig = {
      maxRetries: 3,
      backoffMs: 10,
      retryableErrors: ['TRANSIENT_ERROR']
    };
    const strategy = new RetryStrategy(config);
    let attempts = 0;
    
    const operation = async () => {
      attempts++;
      throw new ServiceError('Permanent error', 'PERMANENT_ERROR');
    };
    
    await expect(strategy.execute(operation)).rejects.toThrow();
    expect(attempts).toBe(1);
  });
});
```

## Integration Tests

### Full Service Integration Tests
```typescript
describe('Service Integration', () => {
  it('should execute use case with context', async () => {
    const service = new Service();
    
    service.registerUseCase(new TestUseCase());
    
    const controllerContext = createControllerContext();
    const context = service.contextBuilder.build(controllerContext);
    
    const result = await service.execute('testUseCase', { input: 'test' }, context);
    
    expect(result.success).toBe(true);
  });

  it('should propagate context through use case execution', async () => {
    const service = new Service();
    
    service.registerUseCase(new ContextAwareUseCase());
    
    const controllerContext = createControllerContext();
    const context = service.contextBuilder.build(controllerContext);
    
    const result = await service.execute('contextAwareUseCase', {}, context);
    
    expect(result.success).toBe(true);
    expect(result.data?.requestId).toBe(context.requestId);
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should execute use case within time limit', async () => {
    const service = new Service();
    
    service.registerUseCase(new FastUseCase());
    
    const context = createServiceContext();
    const start = Date.now();
    
    await service.execute('fastUseCase', {}, context);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10); // < 10ms
  });

  it('should handle multiple use case executions efficiently', async () => {
    const service = new Service();
    
    service.registerUseCase(new FastUseCase());
    
    const context = createServiceContext();
    const start = Date.now();
    
    const promises = Array(100).fill(null).map(() =>
      service.execute('fastUseCase', {}, context)
    );
    
    await Promise.all(promises);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // < 1s for 100 executions
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createServiceContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    requestId: 'req-123',
    correlationId: 'corr-456',
    traceId: 'trace-789',
    userId: 'user-abc',
    timestamp: new Date(),
    metadata: new Map(),
    ...overrides
  };
}

function createControllerContext(overrides?: Partial<ControllerContext>): ControllerContext {
  return {
    request: createTestRequest(),
    requestId: 'req-123',
    correlationId: 'corr-456',
    traceId: 'trace-789',
    userId: 'user-abc',
    parameters: new Map(),
    headers: new Map(),
    metadata: new Map(),
    ...overrides
  };
}

class TestUseCase extends BaseUseCase<any, any> {
  name = 'testUseCase';
  
  async execute(input: any, context: ServiceContext): Promise<ServiceResult<any>> {
    return ServiceResult.success({ input, context: context.requestId });
  }
}

class FastUseCase extends BaseUseCase<any, any> {
  name = 'fastUseCase';
  
  async execute(input: any, context: ServiceContext): Promise<ServiceResult<any>> {
    return ServiceResult.success({});
  }
}

class ContextAwareUseCase extends BaseUseCase<any, any> {
  name = 'contextAwareUseCase';
  
  async execute(input: any, context: ServiceContext): Promise<ServiceResult<any>> {
    return ServiceResult.success({ requestId: context.requestId });
  }
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/service
```

### Integration Tests
```bash
npm run test:integration -- src/layers/service
```

### Performance Tests
```bash
npm run test:performance -- src/layers/service
```

### All Tests
```bash
npm test -- src/layers/service
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/service
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Service Tests

on:
  pull_request:
    paths:
      - 'src/layers/service/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/service
      - run: npm run test:integration -- src/layers/service
      - run: npm run test:performance -- src/layers/service
      - run: npm run test:coverage -- src/layers/service
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all use case execution paths
- Test error handling scenarios
- Test context building and propagation
- Test result handling and transformation
- Test error conversion and mapping
- Maintain test independence

### Error Testing Guidelines
- Test all error types
- Test error-to-result conversion
- Test retry strategies
- Test circuit breaker behavior
- Test error logging

### Performance Testing Guidelines
- Test use case execution time
- Test concurrent use case execution
- Test context building performance
- Test result transformation efficiency
- Monitor memory usage
