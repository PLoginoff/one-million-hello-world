# Testing: MutationTesting Layer

## Test Files

### `__tests__/`
- `MutationTesting.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `MutationTestingStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `MutationTestingConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `MutationTestingDomain.test.ts`, `MutationTestingExtendedDomain.test.ts` — entities and
  value objects.
- `MutationTestingPatterns.test.ts` — specifications, decorators, pipeline.
- `MutationTestingServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/mutation-testing/
```

Single file:

```bash
bun test ./src/layers/mutation-testing/__tests__/MutationTesting.test.ts
```

## Test Approach
- Strategies are tested against the shared `IMutationTestingStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
