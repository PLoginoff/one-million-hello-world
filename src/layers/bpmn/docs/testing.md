# Testing: Bpmn Layer

## Test files

Top-level (`__tests__/`):

- `Bpmn.test.ts` — `execute`/`configure`/`getStatus` contract and
  error wrapping.
- `BpmnStrategies.test.ts` — the five strategies' `execute`,
  `canHandle` and `priority`; `BpmnStrategyFactory` creation and
  unknown-name rejection.
- `BpmnConfiguration.test.ts` — defaults, builder chaining and
  validator bounds.

Domain (`domain/__tests__/`):

- `BpmnDomain.test.ts` — entities, value objects, domain service.
- `BpmnExtendedDomain.test.ts` — specifications, policies, repository,
  pipeline.
- `BpmnServices.test.ts` — execution/query/validation services.
- `BpmnPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/bpmn/
```

or a single suite:

```bash
bun test ./src/layers/bpmn/__tests__/BpmnStrategies.test.ts
```

## Conventions

- Adapters used in tests are `BpmnInMemoryAdapter`,
  `BpmnMockAdapter`, `BpmnStubAdapter` — no network or external
  service.
- Entities and value objects are built inside the test body; there are
  no shared fixture files.
