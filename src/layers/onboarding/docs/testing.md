# Testing: Onboarding Layer

## Test Files

### `__tests__/`
- `Onboarding.test.ts` — implementation: `execute` happy and error paths,
  `configure`, `getStatus` shape (config, metrics, active).
- `OnboardingStrategies.test.ts` — all five strategies: `canHandle`,
  `execute` results, execution counting.
- `OnboardingConfiguration.test.ts` — builder and validator behavior.

### `domain/__tests__/`
- `OnboardingDomain.test.ts`, `OnboardingExtendedDomain.test.ts` — entities and
  value objects.
- `OnboardingPatterns.test.ts` — specifications, decorators, pipeline.
- `OnboardingServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/onboarding/
```

Single file:

```bash
bun test ./src/layers/onboarding/__tests__/Onboarding.test.ts
```

## Test Approach
- Strategies are tested against the shared `IOnboardingStrategy` contract:
  `canHandle` accepts non-null input, `execute` returns
  `{ success, data: { strategy, input, metadata, executionCount } }`.
- `InMemoryAdapter` / `MockAdapter` / `StubAdapter` isolate the layer
  from external systems.
- Implementation tests verify metric recording (`successCount`,
  `failureCount`, `lastExecutionTime`) via `getStatus()`.
