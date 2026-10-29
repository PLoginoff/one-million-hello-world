# Testing: DataLake Layer

## Test files

Top-level (`__tests__/`):

- `DataLake.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `DataLakeStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `DataLakeStrategyFactory` creation and
  unknown-name rejection.
- `DataLakeConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `DataLakeDomain.test.ts` — entities, value objects, domain service.
- `DataLakeExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `DataLakeServices.test.ts` — execution/query/validation services.
- `DataLakePatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/data-lake/
```

or a single suite:

```bash
bun test ./src/layers/data-lake/__tests__/DataLakeStrategies.test.ts
```

## Conventions

- Adapters used in tests are `DataLakeInMemoryAdapter`,
  `DataLakeMockAdapter`, `DataLakeStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
