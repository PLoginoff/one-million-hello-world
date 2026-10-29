# Testing: MultiTenancy Layer

## Test Files

### `__tests__/`
- `MultiTenancy.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `MultiTenancyStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `MultiTenancyConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `MultiTenancyDomain.test.ts`, `MultiTenancyExtendedDomain.test.ts` — entities and
  value objects.
- `MultiTenancyPatterns.test.ts` — specifications, decorators, pipeline.
- `MultiTenancyServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/multi-tenancy/
```

Single file:

```bash
bun test ./src/layers/multi-tenancy/__tests__/MultiTenancy.test.ts
```

## Test Approach
- Strategies are tested against the shared `IMultiTenancyStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
