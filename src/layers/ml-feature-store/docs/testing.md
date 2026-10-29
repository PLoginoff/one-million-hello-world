# Testing: MlFeatureStore Layer

## Test Files

### `__tests__/`
- `MlFeatureStore.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `MlFeatureStoreStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `MlFeatureStoreConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `MlFeatureStoreDomain.test.ts`, `MlFeatureStoreExtendedDomain.test.ts` — entities and
  value objects.
- `MlFeatureStorePatterns.test.ts` — specifications, decorators, pipeline.
- `MlFeatureStoreServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/ml-feature-store/
```

Single file:

```bash
bun test ./src/layers/ml-feature-store/__tests__/MlFeatureStore.test.ts
```

## Test Approach
- Strategies are tested against the shared `IMlFeatureStoreStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
