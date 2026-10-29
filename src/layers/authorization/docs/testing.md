# Testing: Authorization Layer

## Test files

Top-level (`__tests__/`):

- `Authorization.test.ts` — `execute`/`configure`/`getStatus` contract.
- `AuthorizationStrategies.test.ts` — five strategies and
  `AuthorizationStrategyFactory`.
- `AuthorizationConfiguration.test.ts` — defaults, builder, validator.
- `AuthorizationEventProcessor.test.ts` — the authz processor against
  `AuthorizationInMemoryAdapter`: permission checks, role/policy
  lifecycle, resource access, delegation, condition evaluation and
  cache events, asserting validation/enrichment/routing.

Domain (`domain/__tests__/`):

- `AuthorizationDomain.test.ts` — entities, value objects, domain
  service.
- `AuthorizationExtendedDomain.test.ts` — specifications, policies,
  repository, pipeline.
- `AuthorizationServices.test.ts` — execution/query/validation
  services.
- `AuthorizationPatterns.test.ts` — mapper, decorators, observer.

## Running

```bash
bun test ./src/layers/authorization/
```

or a single suite:

```bash
bun test ./src/layers/authorization/__tests__/AuthorizationEventProcessor.test.ts
```

## Conventions

- No live PDP or Redis: `AuthorizationInMemoryAdapter` is the test
  sink; `HttpAuthorizationAdapter`/`RedisAuthorizationAdapter` are
  covered through constructor/config paths.
- Events are literals in the test body; no fixture files.
