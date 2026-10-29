# Testing: PropertyTesting Layer

## Test Files

### `__tests__/`
- `PropertyTesting.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `PropertyTestingStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `PropertyTestingConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `PropertyTestingDomain.test.ts`, `PropertyTestingExtendedDomain.test.ts` — entities and
  value objects.
- `PropertyTestingPatterns.test.ts` — specifications, decorators, pipeline.
- `PropertyTestingServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/property-testing/
```

Single file:

```bash
bun test ./src/layers/property-testing/__tests__/PropertyTesting.test.ts
```

## Test Approach
- Strategies are tested against the shared `IPropertyTestingStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
