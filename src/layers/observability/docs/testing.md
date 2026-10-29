# Testing: Observability Layer

## Test Files

### `__tests__/`
- `Observability.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `ObservabilityStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `ObservabilityConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `ObservabilityDomain.test.ts`, `ObservabilityExtendedDomain.test.ts` — entities and
  value objects.
- `ObservabilityPatterns.test.ts` — specifications, decorators, pipeline.
- `ObservabilityServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/observability/
```

Single file:

```bash
bun test ./src/layers/observability/__tests__/Observability.test.ts
```

## Test Approach
- Strategies are tested against the shared `IObservabilityStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
