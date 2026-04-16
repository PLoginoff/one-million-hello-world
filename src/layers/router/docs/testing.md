# Testing Strategy

## Overview
The Router Layer follows a comprehensive testing strategy to ensure correctness, performance, and reliability of routing functionality. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IRouter Interface**: 100% (type validation)
- **Router Implementation**: 99%+
- **Route Matcher**: 99%+
- **Parameter Extractor**: 99%+
- **Parameter Validator**: 99%+
- **Wildcard Matcher**: 99%+

## Unit Tests

### Test Organization
```
src/layers/router/__tests__/
├── unit/
│   ├── route-matching/
│   │   ├── exact-match.test.ts
│   │   ├── method-match.test.ts
│   │   ├── case-sensitive.test.ts
│   │   └── strict-routing.test.ts
│   ├── parameter-extraction/
│   │   ├── extractor.test.ts
│   │   ├── validator.test.ts
│   │   ├── pattern-validator.test.ts
│   │   └── coercer.test.ts
│   ├── wildcard/
│   │   ├── single-wildcard.test.ts
│   │   ├── double-wildcard.test.ts
│   │   ├── mixed-wildcard.test.ts
│   │   └── wildcard-trie.test.ts
│   ├── route-management/
│   │   ├── registration.test.ts
│   │   ├── removal.test.ts
│   │   └── enumeration.test.ts
│   └── router.test.ts
```

### Unit Test Categories

#### 1. Route Matching Tests
```typescript
describe('Route Matching', () => {
  it('should match exact path', () => {
    const router = new Router();
    router.register({
      method: HttpMethod.GET,
      path: '/api/users',
      handler: 'handler'
    });
    
    const request = createRequest(HttpMethod.GET, '/api/users');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
    expect(result.route?.path).toBe('/api/users');
  });

  it('should not match different method', () => {
    const router = new Router();
    router.register({
      method: HttpMethod.GET,
      path: '/api/users',
      handler: 'handler'
    });
    
    const request = createRequest(HttpMethod.POST, '/api/users');
    const result = router.match(request);
    
    expect(result.matched).toBe(false);
  });

  it('should match case-insensitively when configured', () => {
    const router = new Router({ caseSensitive: false });
    router.register({
      method: HttpMethod.GET,
      path: '/api/users',
      handler: 'handler'
    });
    
    const request = createRequest(HttpMethod.GET, '/API/USERS');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
  });

  it('should match with trailing slash in strict mode', () => {
    const router = new Router({ strictRouting: false });
    router.register({
      method: HttpMethod.GET,
      path: '/api/users',
      handler: 'handler'
    });
    
    const request = createRequest(HttpMethod.GET, '/api/users/');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
  });
});
```

#### 2. Parameter Extraction Tests
```typescript
describe('Parameter Extraction', () => {
  it('should extract named parameters', () => {
    const router = new Router();
    router.register({
      method: HttpMethod.GET,
      path: '/users/:userId',
      handler: 'handler',
      parameters: [
        { name: 'userId', type: ParameterType.UUID, required: true }
      ]
    });
    
    const request = createRequest(HttpMethod.GET, '/users/abc123');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
    expect(result.parameters.get('userId')).toBe('abc123');
  });

  it('should extract multiple parameters', () => {
    const router = new Router();
    router.register({
      method: HttpMethod.GET,
      path: '/users/:userId/posts/:postId',
      handler: 'handler',
      parameters: [
        { name: 'userId', type: ParameterType.UUID, required: true },
        { name: 'postId', type: ParameterType.NUMBER, required: true }
      ]
    });
    
    const request = createRequest(HttpMethod.GET, '/users/abc123/posts/456');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
    expect(result.parameters.get('userId')).toBe('abc123');
    expect(result.parameters.get('postId')).toBe('456');
  });

  it('should validate UUID parameter', () => {
    const validator = new ParameterValidator();
    const paramDef: RouteParameter = {
      name: 'userId',
      type: ParameterType.UUID,
      required: true
    };
    
    const validResult = validator.validateParameter('abc123-def456-7890-1234-567890abcdef', paramDef);
    expect(validResult.valid).toBe(true);
    
    const invalidResult = validator.validateParameter('not-a-uuid', paramDef);
    expect(invalidResult.valid).toBe(false);
  });

  it('should validate number parameter', () => {
    const validator = new ParameterValidator();
    const paramDef: RouteParameter = {
      name: 'postId',
      type: ParameterType.NUMBER,
      required: true
    };
    
    const validResult = validator.validateParameter('123', paramDef);
    expect(validResult.valid).toBe(true);
    expect(validResult.value).toBe(123);
    
    const invalidResult = validator.validateParameter('not-a-number', paramDef);
    expect(invalidResult.valid).toBe(false);
  });

  it('should use default value for optional parameter', () => {
    const router = new Router();
    router.register({
      method: HttpMethod.GET,
      path: '/users/:userId?',
      handler: 'handler',
      parameters: [
        { 
          name: 'userId', 
          type: ParameterType.UUID, 
          required: false,
          defaultValue: 'default-uuid'
        }
      ]
    });
    
    const request = createRequest(HttpMethod.GET, '/users/');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
    expect(result.parameters.get('userId')).toBe('default-uuid');
  });
});
```

#### 3. Wildcard Matching Tests
```typescript
describe('Wildcard Matching', () => {
  it('should match single wildcard', () => {
    const router = new Router({ wildcardEnabled: true });
    router.registerWildcard({
      method: HttpMethod.GET,
      path: '/api/*',
      handler: 'handler'
    });
    
    const request = createRequest(HttpMethod.GET, '/api/users');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
    expect(result.wildcard).toBe(true);
  });

  it('should match double wildcard', () => {
    const router = new Router({ wildcardEnabled: true });
    router.registerWildcard({
      method: HttpMethod.GET,
      path: '/static/**',
      handler: 'handler'
    });
    
    const request = createRequest(HttpMethod.GET, '/static/css/style.css');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
    expect(result.wildcard).toBe(true);
  });

  it('should not match when wildcard disabled', () => {
    const router = new Router({ wildcardEnabled: false });
    router.registerWildcard({
      method: HttpMethod.GET,
      path: '/api/*',
      handler: 'handler'
    });
    
    const request = createRequest(HttpMethod.GET, '/api/users');
    const result = router.match(request);
    
    expect(result.matched).toBe(false);
  });

  it('should prioritize exact route over wildcard', () => {
    const router = new Router({ 
      wildcardEnabled: true,
      wildcardBehavior: WildcardBehavior.PRIORITY 
    });
    
    router.register({
      method: HttpMethod.GET,
      path: '/api/users',
      handler: 'exactHandler'
    });
    
    router.registerWildcard({
      method: HttpMethod.GET,
      path: '/api/*',
      handler: 'wildcardHandler'
    });
    
    const request = createRequest(HttpMethod.GET, '/api/users');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
    expect(result.route?.handler).toBe('exactHandler');
    expect(result.wildcard).toBe(false);
  });
});
```

#### 4. Route Management Tests
```typescript
describe('Route Management', () => {
  it('should register route', () => {
    const router = new Router();
    const route: Route = {
      method: HttpMethod.GET,
      path: '/api/users',
      handler: 'handler'
    };
    
    router.register(route);
    
    const retrieved = router.getRoute(HttpMethod.GET, '/api/users');
    expect(retrieved).toBe(route);
  });

  it('should unregister route', () => {
    const router = new Router();
    const route: Route = {
      method: HttpMethod.GET,
      path: '/api/users',
      handler: 'handler'
    };
    
    router.register(route);
    router.unregister(HttpMethod.GET, '/api/users');
    
    const retrieved = router.getRoute(HttpMethod.GET, '/api/users');
    expect(retrieved).toBeUndefined();
  });

  it('should clear all routes', () => {
    const router = new Router();
    
    router.register({ method: HttpMethod.GET, path: '/api/users', handler: 'handler' });
    router.register({ method: HttpMethod.POST, path: '/api/users', handler: 'handler' });
    
    router.clear();
    
    const allRoutes = router.getAllRoutes();
    expect(allRoutes).toHaveLength(0);
  });

  it('should enumerate all routes', () => {
    const router = new Router();
    
    router.register({ method: HttpMethod.GET, path: '/api/users', handler: 'handler1' });
    router.register({ method: HttpMethod.POST, path: '/api/users', handler: 'handler2' });
    router.register({ method: HttpMethod.GET, path: '/api/posts', handler: 'handler3' });
    
    const allRoutes = router.getAllRoutes();
    expect(allRoutes).toHaveLength(3);
  });

  it('should get routes by method', () => {
    const router = new Router();
    
    router.register({ method: HttpMethod.GET, path: '/api/users', handler: 'handler1' });
    router.register({ method: HttpMethod.POST, path: '/api/users', handler: 'handler2' });
    router.register({ method: HttpMethod.GET, path: '/api/posts', handler: 'handler3' });
    
    const getRoutes = router.getRoutesByMethod(HttpMethod.GET);
    expect(getRoutes).toHaveLength(2);
  });
});
```

## Integration Tests

### Full Router Integration Tests
```typescript
describe('Router Integration', () => {
  it('should match and extract parameters', () => {
    const router = new Router();
    
    router.register({
      method: HttpMethod.GET,
      path: '/users/:userId/posts/:postId',
      handler: 'getPostHandler',
      parameters: [
        { name: 'userId', type: ParameterType.UUID, required: true },
        { name: 'postId', type: ParameterType.NUMBER, required: true }
      ]
    });
    
    const request = createRequest(HttpMethod.GET, '/users/abc123/posts/456');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
    expect(result.parameters.get('userId')).toBe('abc123');
    expect(result.parameters.get('postId')).toBe('456');
  });

  it('should handle route conflicts with priority', () => {
    const router = new PriorityRouter();
    
    router.register({
      method: HttpMethod.GET,
      path: '/api/*',
      handler: 'wildcardHandler',
      priority: 1
    });
    
    router.register({
      method: HttpMethod.GET,
      path: '/api/users',
      handler: 'exactHandler',
      priority: 10
    });
    
    const request = createRequest(HttpMethod.GET, '/api/users');
    const result = router.match(request);
    
    expect(result.matched).toBe(true);
    expect(result.route?.handler).toBe('exactHandler');
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should match routes within time limit', () => {
    const router = new Router();
    
    for (let i = 0; i < 1000; i++) {
      router.register({
        method: HttpMethod.GET,
        path: `/api/endpoint${i}`,
        handler: `handler${i}`
      });
    }
    
    const request = createRequest(HttpMethod.GET, '/api/endpoint500');
    const start = Date.now();
    
    const result = router.match(request);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1); // < 1ms
    expect(result.matched).toBe(true);
  });

  it('should extract parameters efficiently', () => {
    const router = new Router();
    
    router.register({
      method: HttpMethod.GET,
      path: '/users/:userId/posts/:postId/comments/:commentId',
      handler: 'handler',
      parameters: [
        { name: 'userId', type: ParameterType.UUID, required: true },
        { name: 'postId', type: ParameterType.NUMBER, required: true },
        { name: 'commentId', type: ParameterType.NUMBER, required: true }
      ]
    });
    
    const request = createRequest(HttpMethod.GET, '/users/abc123/posts/456/comments/789');
    const start = Date.now();
    
    const result = router.match(request);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1); // < 1ms
    expect(result.parameters.size).toBe(3);
  });

  it('should handle wildcard matching efficiently', () => {
    const router = new Router({ wildcardEnabled: true });
    
    router.registerWildcard({
      method: HttpMethod.GET,
      path: '/static/**',
      handler: 'handler'
    });
    
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      const request = createRequest(HttpMethod.GET, `/static/path/to/file${i}.txt`);
      router.match(request);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 1000 matches
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createRequest(method: HttpMethod, path: string): HttpRequest {
  return {
    method,
    uri: path,
    version: HttpVersion.HTTP_1_1,
    headers: new Map(),
    body: Buffer.alloc(0),
    remoteAddress: '192.168.1.1',
    securityContext: createSecurityContext()
  };
}

function createRoute(method: HttpMethod, path: string): Route {
  return {
    method,
    path,
    handler: 'testHandler'
  };
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/router
```

### Integration Tests
```bash
npm run test:integration -- src/layers/router
```

### Performance Tests
```bash
npm run test:performance -- src/layers/router
```

### All Tests
```bash
npm test -- src/layers/router
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/router
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Router Tests

on:
  pull_request:
    paths:
      - 'src/layers/router/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/router
      - run: npm run test:integration -- src/layers/router
      - run: npm run test:performance -- src/layers/router
      - run: npm run test:coverage -- src/layers/router
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all route matching strategies
- Test parameter extraction and validation
- Test wildcard patterns thoroughly
- Test route management operations
- Test configuration options
- Maintain test independence

### Performance Testing Guidelines
- Test with large route sets
- Test parameter extraction performance
- Test wildcard matching efficiency
- Test trie-based routing performance
- Monitor memory usage

### Security Testing Guidelines
- Test parameter validation
- Test path traversal prevention
- Test wildcard security implications
- Test route conflict resolution
