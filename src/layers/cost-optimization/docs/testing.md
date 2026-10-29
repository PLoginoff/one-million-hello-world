# Testing: CostOptimization Layer

## Test files

Top-level (`__tests__/`):

- `CostOptimization.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `CostOptimizationStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `CostOptimizationStrategyFactory` creation and
  unknown-name rejection.
- `CostOptimizationConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `CostOptimizationDomain.test.ts` — entities, value objects, domain service.
- `CostOptimizationExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `CostOptimizationServices.test.ts` — execution/query/validation services.
- `CostOptimizationPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/cost-optimization/
```

or a single suite:

```bash
bun test ./src/layers/cost-optimization/__tests__/CostOptimizationStrategies.test.ts
```

## Conventions

- Adapters used in tests are `CostOptimizationInMemoryAdapter`,
  `CostOptimizationMockAdapter`, `CostOptimizationStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
