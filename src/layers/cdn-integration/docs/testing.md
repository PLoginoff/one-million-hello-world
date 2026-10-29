# Testing: CdnIntegration Layer

## Test files

Top-level (`__tests__/`):

- `CdnIntegration.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `CdnIntegrationStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `CdnIntegrationStrategyFactory` creation and
  unknown-name rejection.
- `CdnIntegrationConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `CdnIntegrationDomain.test.ts` — entities, value objects, domain service.
- `CdnIntegrationExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `CdnIntegrationServices.test.ts` — execution/query/validation services.
- `CdnIntegrationPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/cdn-integration/
```

or a single suite:

```bash
bun test ./src/layers/cdn-integration/__tests__/CdnIntegrationStrategies.test.ts
```

## Conventions

- Adapters used in tests are `CdnIntegrationInMemoryAdapter`,
  `CdnIntegrationMockAdapter`, `CdnIntegrationStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
