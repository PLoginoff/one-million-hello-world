# Testing: Migrations Layer

## Test Files

### `__tests__/`
- `Migrations.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `MigrationsStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `MigrationsConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `MigrationsDomain.test.ts`, `MigrationsExtendedDomain.test.ts` — entities and
  value objects.
- `MigrationsPatterns.test.ts` — specifications, decorators, pipeline.
- `MigrationsServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/migrations/
```

Single file:

```bash
bun test ./src/layers/migrations/__tests__/Migrations.test.ts
```

## Test Approach
- Strategies are tested against the shared `IMigrationsStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
