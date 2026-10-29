# Testing: ReadModel Layer

## Test Files

### `__tests__/`
- `ReadModel.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `ReadModelStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `ReadModelConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `ReadModelDomain.test.ts`, `ReadModelExtendedDomain.test.ts` — entities and
  value objects.
- `ReadModelPatterns.test.ts` — specifications, decorators, pipeline.
- `ReadModelServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/read-model/
```

Single file:

```bash
bun test ./src/layers/read-model/__tests__/ReadModel.test.ts
```

## Test Approach
- Strategies are tested against the shared `IReadModelStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
