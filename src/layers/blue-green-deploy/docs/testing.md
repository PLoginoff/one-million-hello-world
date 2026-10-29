# Testing: BlueGreenDeploy Layer

## Test files

Top-level (`__tests__/`):

- `BlueGreenDeploy.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `BlueGreenDeployStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `BlueGreenDeployStrategyFactory` creation and
  unknown-name rejection.
- `BlueGreenDeployConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `BlueGreenDeployDomain.test.ts` — entities, value objects, domain service.
- `BlueGreenDeployExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `BlueGreenDeployServices.test.ts` — execution/query/validation services.
- `BlueGreenDeployPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/blue-green-deploy/
```

or a single suite:

```bash
bun test ./src/layers/blue-green-deploy/__tests__/BlueGreenDeployStrategies.test.ts
```

## Conventions

- Adapters used in tests are `BlueGreenDeployInMemoryAdapter`,
  `BlueGreenDeployMockAdapter`, `BlueGreenDeployStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
