# Testing: Billing Layer

## Test files

Top-level (`__tests__/`):

- `Billing.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `BillingStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `BillingStrategyFactory` creation and
  unknown-name rejection.
- `BillingConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `BillingDomain.test.ts` — entities, value objects, domain service.
- `BillingExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `BillingServices.test.ts` — execution/query/validation services.
- `BillingPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/billing/
```

or a single suite:

```bash
bun test ./src/layers/billing/__tests__/BillingStrategies.test.ts
```

## Conventions

- Adapters used in tests are `BillingInMemoryAdapter`,
  `BillingMockAdapter`, `BillingStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
