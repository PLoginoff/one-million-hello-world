# Testing: ServiceMesh Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/ServiceMesh.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/ServiceMeshStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `ServiceMeshStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/ServiceMeshConfiguration.test.ts` | `ServiceMeshConfigurationBuilder` fluent API and `ServiceMeshConfigurationValidator` limits |
| `domain/__tests__/ServiceMeshDomain.test.ts` | `ServiceMeshEntity`, `ServiceMeshValueObject`, `ServiceMeshDomainService` |
| `domain/__tests__/ServiceMeshExtendedDomain.test.ts` | `ServiceMeshExecution`, `ServiceMeshThreshold`, `ServiceMeshTimeWindow`, `ServiceMeshPriority`, `ServiceMeshExecuted`/`ServiceMeshFailed` events |
| `domain/__tests__/ServiceMeshPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `ServiceMeshEventObserver`, `ServiceMeshProcessingPipeline`, caching/logging decorators, `ServiceMeshEventHandler` |
| `domain/__tests__/ServiceMeshServices.test.ts` | Execution/validation/query services, `ServiceMeshInMemoryRepository`, `ServiceMeshMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/service-mesh/
```

Single file:

```bash
bun test ./src/layers/service-mesh/__tests__/ServiceMeshStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
