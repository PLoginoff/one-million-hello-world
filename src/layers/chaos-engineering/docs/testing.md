# Testing: ChaosEngineering Layer

## Test files

Top-level (`__tests__/`):

- `ChaosEngineering.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `ChaosEngineeringStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `ChaosEngineeringStrategyFactory` creation and
  unknown-name rejection.
- `ChaosEngineeringConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `ChaosEngineeringDomain.test.ts` — entities, value objects, domain service.
- `ChaosEngineeringExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `ChaosEngineeringServices.test.ts` — execution/query/validation services.
- `ChaosEngineeringPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/chaos-engineering/
```

or a single suite:

```bash
bun test ./src/layers/chaos-engineering/__tests__/ChaosEngineeringStrategies.test.ts
```

## Conventions

- Adapters used in tests are `ChaosEngineeringInMemoryAdapter`,
  `ChaosEngineeringMockAdapter`, `ChaosEngineeringStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
