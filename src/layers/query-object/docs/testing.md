# Testing: QueryObject Layer

## Test Files

### `__tests__/`
- `QueryObject.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `QueryObjectStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `QueryObjectConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `QueryObjectDomain.test.ts`, `QueryObjectExtendedDomain.test.ts` — entities and
  value objects.
- `QueryObjectPatterns.test.ts` — specifications, decorators, pipeline.
- `QueryObjectServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/query-object/
```

Single file:

```bash
bun test ./src/layers/query-object/__tests__/QueryObject.test.ts
```

## Test Approach
- Strategies are tested against the shared `IQueryObjectStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
