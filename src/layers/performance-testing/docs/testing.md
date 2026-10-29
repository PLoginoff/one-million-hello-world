# Testing: PerformanceTesting Layer

## Test Files

### `__tests__/`
- `PerformanceTesting.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `PerformanceTestingStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `PerformanceTestingConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `PerformanceTestingDomain.test.ts`, `PerformanceTestingExtendedDomain.test.ts` — entities and
  value objects.
- `PerformanceTestingPatterns.test.ts` — specifications, decorators, pipeline.
- `PerformanceTestingServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/performance-testing/
```

Single file:

```bash
bun test ./src/layers/performance-testing/__tests__/PerformanceTesting.test.ts
```

## Test Approach
- Strategies are tested against the shared `IPerformanceTestingStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
