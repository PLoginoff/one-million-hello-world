# Testing: API Versioning Layer

## Test files

Top-level (`__tests__/`):

- `ApiVersioning.test.ts` — `execute`/`configure`/`getStatus` contract.
- `ApiVersioningStrategies.test.ts` — five strategies and factory
  lookup.
- `ApiVersioningConfiguration.test.ts` — defaults, builder, validator.

Domain (`domain/__tests__/`):

- `ApiVersioningDomain.test.ts` — entities, value objects, domain
  service.
- `ApiVersioningExtendedDomain.test.ts` — specifications, policies,
  repository, pipeline.
- `ApiVersioningServices.test.ts` — execution/query/validation services.
- `ApiVersioningPatterns.test.ts` — mapper, decorators, observer.

## Running

```bash
bun test ./src/layers/api-versioning/
```

## Conventions

- Adapters used in tests are `ApiVersioningInMemoryAdapter`,
  `ApiVersioningMockAdapter`, `ApiVersioningStubAdapter` — no network.
- Entities/value objects are constructed in the test body; no shared
  fixture files.
