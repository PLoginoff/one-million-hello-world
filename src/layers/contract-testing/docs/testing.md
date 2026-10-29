# Testing: ContractTesting Layer

## Test files

Top-level (`__tests__/`):

- `ContractTesting.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `ContractTestingStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `ContractTestingStrategyFactory` creation and
  unknown-name rejection.
- `ContractTestingConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `ContractTestingDomain.test.ts` — entities, value objects, domain service.
- `ContractTestingExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `ContractTestingServices.test.ts` — execution/query/validation services.
- `ContractTestingPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/contract-testing/
```

or a single suite:

```bash
bun test ./src/layers/contract-testing/__tests__/ContractTestingStrategies.test.ts
```

## Conventions

- Adapters used in tests are `ContractTestingInMemoryAdapter`,
  `ContractTestingMockAdapter`, `ContractTestingStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
