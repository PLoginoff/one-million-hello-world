# Testing: DataQuality Layer

## Test files

Top-level (`__tests__/`):

- `DataQuality.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `DataQualityStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `DataQualityStrategyFactory` creation and
  unknown-name rejection.
- `DataQualityConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `DataQualityDomain.test.ts` — entities, value objects, domain service.
- `DataQualityExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `DataQualityServices.test.ts` — execution/query/validation services.
- `DataQualityPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/data-quality/
```

or a single suite:

```bash
bun test ./src/layers/data-quality/__tests__/DataQualityStrategies.test.ts
```

## Conventions

- Adapters used in tests are `DataQualityInMemoryAdapter`,
  `DataQualityMockAdapter`, `DataQualityStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
