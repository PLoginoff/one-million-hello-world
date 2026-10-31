# Testing Strategy

## Overview
Router Layer tests cover `Router` (`IRouter`): route matching, parameter extraction/validation, wildcard matching, and route management. Tests use `bun:test` in `src/layers/router/__tests__/`.

## Coverage Targets

- Minimum 95%, target 99%+; branch 90%+, functions 100%.
- `Router`, matching, parameter, wildcard: 99%+.

## Test Organization

```
src/layers/router/__tests__/
├── Router.test.ts / .advanced / .edge-cases
├── RouterEngine.test.ts / RouterAdvancedEngine.test.ts / RouterEngineEdge.test.ts
├── RouterConfiguration.test.ts
├── RouterStrategies.test.ts / RouterTypes.test.ts
└── … (matching/params/wildcard suites)
```

## Unit Test Categories

### Route Matching
```typescript
router.register({ method: HttpMethod.GET, path: '/api/users', handler: 'handler' });
router.match(createRequest(HttpMethod.GET, '/api/users')).matched;   // true
router.match(createRequest(HttpMethod.POST, '/api/users')).matched;  // false
```

Cover: exact path, method mismatch, `caseSensitive: false`, `strictRouting: false` (trailing slash).

### Parameter Extraction
```typescript
router.register({ method: HttpMethod.GET, path: '/users/:userId/posts/:postId', handler: 'h',
  parameters: [
    { name: 'userId', type: ParameterType.UUID, required: true },
    { name: 'postId', type: ParameterType.NUMBER, required: true },
  ]});
result.parameters.get('userId'); // 'abc123'
result.parameters.get('postId'); // '456'
```

Cover: multiple params, `ParameterValidator` per type (`UUID`, `NUMBER`, …), optional `?` params with `defaultValue`.

### Wildcard Matching
```typescript
const router = new Router({ wildcardEnabled: true });
router.registerWildcard({ method: HttpMethod.GET, path: '/static/**', handler: 'h' });
router.match(req('/static/css/a.css')).wildcard; // true
```

Cover: `*` single, `**` deep, `wildcardEnabled: false` → no match, `wildcardBehavior: PRIORITY` (exact beats wildcard).

### Route Management
`register`, `unregister`, `getRoute(method, path)`, `getAllRoutes()`, `getRoutesByMethod(method)`, `clear()`.

## Integration Tests

- Match + extract across multi-param routes.
- Conflict resolution: higher-`priority` exact route wins over wildcard.

## Performance Tests

- Match over 1k registered routes: <1 ms per lookup.
- Multi-param extraction: <1 ms.
- 1k wildcard matches: <100 ms.

## Test Utilities

```typescript
function createRequest(method: HttpMethod, path: string): HttpRequest {
  return { method, uri: path, version: HttpVersion.HTTP_1_1,
           headers: new Map(), body: Buffer.alloc(0),
           remoteAddress: '192.168.1.1', securityContext: createSecurityContext() };
}
function createRoute(method, path) { return { method, path, handler: 'testHandler' }; }
```

## Running Tests

```bash
bun test ./src/layers/router/
bun test ./src/layers/router/__tests__/Router.test.ts
bun test --coverage ./src/layers/router/
```

## Best Practices

- Cover all `ParameterType` validators (valid + invalid input).
- Exercise `caseSensitive`/`strictRouting`/`wildcardEnabled` config toggles.
- Keep tests independent; `router.clear()` between groups.
- Benchmark against large route tables and deep wildcard tries.
