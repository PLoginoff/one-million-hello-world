# Testing: PolicyEngine Layer

## Test Files

### `__tests__/`
- `PolicyEngine.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `PolicyEngineStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `PolicyEngineConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `PolicyEngineDomain.test.ts`, `PolicyEngineExtendedDomain.test.ts` — entities and
  value objects.
- `PolicyEnginePatterns.test.ts` — specifications, decorators, pipeline.
- `PolicyEngineServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/policy-engine/
```

Single file:

```bash
bun test ./src/layers/policy-engine/__tests__/PolicyEngine.test.ts
```

## Test Approach
- Strategies are tested against the shared `IPolicyEngineStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
