# Testing: Reporting Layer

## Test Files

### `__tests__/`
- `Reporting.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `ReportingStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `ReportingConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `ReportingDomain.test.ts`, `ReportingExtendedDomain.test.ts` — entities and
  value objects.
- `ReportingPatterns.test.ts` — specifications, decorators, pipeline.
- `ReportingServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/reporting/
```

Single file:

```bash
bun test ./src/layers/reporting/__tests__/Reporting.test.ts
```

## Test Approach
- Strategies are tested against the shared `IReportingStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
