# Testing: Cqrs Layer

## Test files

Top-level (`__tests__/`):

- `Cqrs.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `CqrsStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `CqrsStrategyFactory` creation and
  unknown-name rejection.
- `CqrsConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `CqrsDomain.test.ts` — entities, value objects, domain service.
- `CqrsExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `CqrsServices.test.ts` — execution/query/validation services.
- `CqrsPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/cqrs/
```

or a single suite:

```bash
bun test ./src/layers/cqrs/__tests__/CqrsStrategies.test.ts
```

## Conventions

- Adapters used in tests are `CqrsInMemoryAdapter`,
  `CqrsMockAdapter`, `CqrsStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
