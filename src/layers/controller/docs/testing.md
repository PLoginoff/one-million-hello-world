# Testing Strategy

## Overview
The Controller Layer follows a comprehensive testing strategy to ensure correctness, error handling, and performance of request handling functionality. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IController Interface**: 100% (type validation)
- **Controller Implementation**: 99%+
- **Handler Registry**: 99%+
- **Context Builder**: 99%+
- **Response Builder**: 99%+
- **Error Handler**: 99%+

## Unit Tests

### Test Organization
```
src/layers/controller/__tests__/
├── unit/
│   ├── request-handling/
│   │   ├── handler-registry.test.ts
│   │   ├── request-handler.test.ts
│   │   ├── context-builder.test.ts
│   │   └── handler-executor.test.ts
│   ├── response-generation/
│   │   ├── success-response.test.ts
│   │   ├── error-response.test.ts
│   │   ├── header-manager.test.ts
│   │   └── cache-header.test.ts
│   ├── error-handling/
│   │   ├── error-handler.test.ts
│   │   ├── error-middleware.test.ts
│   │   ├── status-code-mapper.test.ts
│   │   └── recovery-strategy.test.ts
│   └── controller.test.ts
```

### Unit Test Categories

#### 1. Handler Registry Tests
```typescript
describe('Handler Registry', () => {
  it('should register handler', () => {
    const registry = new HandlerRegistry();
    const handler = async () => ({ success: true });
    
    registry.register('testOperation', handler);
    
    expect(registry.has('testOperation')).toBe(true);
    expect(registry.get('testOperation')).toBe(handler);
  });

  it('should unregister handler', () => {
    const registry = new HandlerRegistry();
    const handler = async () => ({ success: true });
    
    registry.register('testOperation', handler);
    registry.unregister('testOperation');
    
    expect(registry.has('testOperation')).toBe(false);
  });

  it('should return all handlers', () => {
    const registry = new HandlerRegistry();
    
    registry.register('op1', async () => ({ success: true }));
    registry.register('op2', async () => ({ success: true }));
    
    const allHandlers = registry.getAll();
    expect(allHandlers.size).toBe(2);
  });
});
```

#### 2. Context Builder Tests
```typescript
describe('Context Builder', () => {
  it('should build context from request', async () => {
    const builder = new ContextBuilder();
    const request = createTestRequest();
    
    const context = await builder.build(request);
    
    expect(context.request).toBe(request);
    expect(context.requestId).toBeDefined();
    expect(context.correlationId).toBeDefined();
    expect(context.traceId).toBeDefined();
  });

  it('should extract request ID from header', async () => {
    const builder = new ContextBuilder();
    const request = createTestRequest({
      headers: new Map([['x-request-id', 'req-123']])
    });
    
    const context = await builder.build(request);
    
    expect(context.requestId).toBe('req-123');
  });

  it('should extract user ID from security context', async () => {
    const builder = new ContextBuilder();
    const request = createTestRequest({
      securityContext: createSecurityContext({ userId: 'user-123' })
    });
    
    const context = await builder.build(request);
    
    expect(context.userId).toBe('user-123');
  });

  it('should extract parameters from request', async () => {
    const builder = new ContextBuilder();
    const request = createTestRequest({
      uri: '/users/123?filter=active',
      routeMatch: {
        matched: true,
        route: null,
        parameters: new Map([['userId', '123']]),
        wildcard: false
      }
    });
    
    const context = await builder.build(request);
    
    expect(context.parameters.get('userId')).toBe('123');
    expect(context.parameters.get('filter')).toBe('active');
  });
});
```

#### 3. Response Builder Tests
```typescript
describe('Success Response Builder', () => {
  it('should build success response', () => {
    const builder = new SuccessResponseBuilder();
    const data = { message: 'Success' };
    
    const response = builder.build(data);
    
    expect(response.statusCode).toBe(HttpStatusCode.OK);
    const body = JSON.parse(response.body.toString());
    expect(body.success).toBe(true);
    expect(body.data).toEqual(data);
  });

  it('should build created response', () => {
    const builder = new SuccessResponseBuilder();
    const data = { id: '123' };
    
    const response = builder.buildCreated(data);
    
    expect(response.statusCode).toBe(HttpStatusCode.CREATED);
  });

  it('should build no content response', () => {
    const builder = new SuccessResponseBuilder();
    
    const response = builder.buildNoContent();
    
    expect(response.statusCode).toBe(HttpStatusCode.NO_CONTENT);
    expect(response.body.length).toBe(0);
  });
});
```

#### 4. Error Handler Tests
```typescript
describe('Error Handler', () => {
  it('should handle controller error', async () => {
    const handler = new ErrorHandler();
    const error = new ControllerError('Test error', HttpStatusCode.BAD_REQUEST, 'TEST_ERROR');
    const context = createControllerContext();
    
    const response = await handler.handle(error, context);
    
    expect(response.statusCode).toBe(HttpStatusCode.BAD_REQUEST);
    const body = JSON.parse(response.body.toString());
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('TEST_ERROR');
  });

  it('should convert generic error to controller error', async () => {
    const handler = new ErrorHandler();
    const error = new Error('Generic error');
    const context = createControllerContext();
    
    const response = await handler.handle(error, context);
    
    expect(response.statusCode).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
    const body = JSON.parse(response.body.toString());
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('should include request ID in error response', async () => {
    const handler = new ErrorHandler();
    const error = new Error('Test error');
    const context = createControllerContext({ requestId: 'req-123' });
    
    const response = await handler.handle(error, context);
    
    const body = JSON.parse(response.body.toString());
    expect(body.requestId).toBe('req-123');
  });
});
```

#### 5. Error Middleware Tests
```typescript
describe('Error Middleware', () => {
  it('should wrap handler and handle errors', async () => {
    const errorHandler = new ErrorHandler();
    const middleware = new ErrorMiddleware(errorHandler);
    const handler = async () => { throw new Error('Handler error'); };
    const context = createControllerContext();
    
    const response = await middleware.wrap(handler, context);
    
    expect(response.statusCode).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
    const body = JSON.parse(response.body.toString());
    expect(body.success).toBe(false);
  });

  it('should return success response when handler succeeds', async () => {
    const errorHandler = new ErrorHandler();
    const middleware = new ErrorMiddleware(errorHandler);
    const handler = async () => ({ success: true, data: { message: 'Success' } });
    const context = createControllerContext();
    
    const response = await middleware.wrap(handler, context);
    
    expect(response.statusCode).toBe(HttpStatusCode.OK);
    const body = JSON.parse(response.body.toString());
    expect(body.success).toBe(true);
  });
});
```

## Integration Tests

### Full Controller Integration Tests
```typescript
describe('Controller Integration', () => {
  it('should handle complete request lifecycle', async () => {
    const controller = new Controller();
    
    controller.registerHandler('getUser', async (context) => {
      return {
        success: true,
        data: { userId: context.parameters.get('userId') }
      };
    });
    
    const request = createTestRequest({
      uri: '/users/123',
      routeMatch: {
        matched: true,
        route: null,
        parameters: new Map([['userId', '123']]),
        wildcard: false
      }
    });
    
    const response = await controller.handle(request, 'getUser');
    
    expect(response.statusCode).toBe(HttpStatusCode.OK);
    const body = JSON.parse(response.body.toString());
    expect(body.data.userId).toBe('123');
  });

  it('should propagate context through handler execution', async () => {
    const controller = new Controller();
    
    controller.registerHandler('testOperation', async (context) => {
      return {
        success: true,
        data: {
          requestId: context.requestId,
          correlationId: context.correlationId
        }
      };
    });
    
    const request = createTestRequest();
    const response = await controller.handle(request, 'testOperation');
    
    const body = JSON.parse(response.body.toString());
    expect(body.data.requestId).toBeDefined();
    expect(body.data.correlationId).toBeDefined();
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should execute handler within time limit', async () => {
    const controller = new Controller();
    
    controller.registerHandler('fastOperation', async () => {
      return { success: true, data: {} };
    });
    
    const request = createTestRequest();
    const start = Date.now();
    
    await controller.handle(request, 'fastOperation');
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10); // < 10ms
  });

  it('should handle multiple requests efficiently', async () => {
    const controller = new Controller();
    
    controller.registerHandler('testOperation', async () => {
      return { success: true, data: {} };
    });
    
    const requests = Array(100).fill(null).map(() => createTestRequest());
    const start = Date.now();
    
    await Promise.all(requests.map(r => controller.handle(r, 'testOperation')));
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // < 1s for 100 requests
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createTestRequest(overrides?: Partial<HttpRequest>): HttpRequest {
  return {
    method: HttpMethod.GET,
    uri: '/api/test',
    version: HttpVersion.HTTP_1_1,
    headers: new Map(),
    body: Buffer.alloc(0),
    remoteAddress: '192.168.1.1',
    securityContext: createSecurityContext(),
    routeMatch: {
      matched: true,
      route: null,
      parameters: new Map(),
      wildcard: false
    },
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

function createSecurityContext(overrides?: Partial<SecurityContext>): SecurityContext {
  return {
    userId: 'test-user',
    roles: ['user'],
    permissions: [],
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    authenticationMethod: AuthenticationMethod.BEARER_TOKEN,
    authenticatedAt: new Date(),
    metadata: new Map(),
    ...overrides
  };
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/controller
```

### Integration Tests
```bash
npm run test:integration -- src/layers/controller
```

### Performance Tests
```bash
npm run test:performance -- src/layers/controller
```

### All Tests
```bash
npm test -- src/layers/controller
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/controller
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Controller Tests

on:
  pull_request:
    paths:
      - 'src/layers/controller/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/controller
      - run: npm run test:integration -- src/layers/controller
      - run: npm run test:performance -- src/layers/controller
      - run: npm run test:coverage -- src/layers/controller
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all handler execution paths
- Test error handling scenarios
- Test context building and propagation
- Test response generation
- Test error conversion and mapping
- Maintain test independence

### Error Testing Guidelines
- Test all error types
- Test error-to-status mapping
- Test error detail inclusion
- Test error logging
- Test error recovery strategies

### Performance Testing Guidelines
- Test handler execution time
- Test concurrent request handling
- Test context building performance
- Test response generation efficiency
- Monitor memory usage
