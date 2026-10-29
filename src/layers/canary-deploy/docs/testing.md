# Testing: CanaryDeploy Layer

## Test files

Top-level (`__tests__/`):

- `CanaryDeploy.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `CanaryDeployStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `CanaryDeployStrategyFactory` creation and
  unknown-name rejection.
- `CanaryDeployConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `CanaryDeployDomain.test.ts` — entities, value objects, domain service.
- `CanaryDeployExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `CanaryDeployServices.test.ts` — execution/query/validation services.
- `CanaryDeployPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/canary-deploy/
```

or a single suite:

```bash
bun test ./src/layers/canary-deploy/__tests__/CanaryDeployStrategies.test.ts
```

## Conventions

- Adapters used in tests are `CanaryDeployInMemoryAdapter`,
  `CanaryDeployMockAdapter`, `CanaryDeployStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
