# Testing: BatchProcessing Layer

## Test files

Top-level (`__tests__/`):

- `BatchProcessing.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `BatchProcessingStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `BatchProcessingStrategyFactory` creation and
  unknown-name rejection.
- `BatchProcessingConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `BatchProcessingDomain.test.ts` — entities, value objects, domain service.
- `BatchProcessingExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `BatchProcessingServices.test.ts` — execution/query/validation services.
- `BatchProcessingPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/batch-processing/
```

or a single suite:

```bash
bun test ./src/layers/batch-processing/__tests__/BatchProcessingStrategies.test.ts
```

## Conventions

- Adapters used in tests are `BatchProcessingInMemoryAdapter`,
  `BatchProcessingMockAdapter`, `BatchProcessingStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
