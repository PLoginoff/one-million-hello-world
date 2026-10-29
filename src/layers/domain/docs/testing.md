# Testing: Domain Layer

## Running tests

```bash
bun test ./src/layers/domain/
```

## Actual test files

`__tests__/`:

| File | Covers |
|------|--------|
| `DomainManager.test.ts` | `createEntity`/`updateEntity`/`deleteEntity`/`getEntity` — validation, `ENTITY_NOT_FOUND`, `updatedAt` tracking; `publishEvent` |
| `HelloWorldMessage.test.ts` | The concrete aggregate: `HelloWorldMessage.create`, `MessageContent` VO, version/audit-trail tracking, locale/format options |
| `DomainError.test.ts` | `errors/DomainError.ts` |
| `DomainFactory.test.ts` | `services/DomainFactory.ts` + `HelloWorldFactory` |
| `DomainMetricsCollector.test.ts` | Metrics collector |
| `DomainStrategies.test.ts` | Strategies |
| `DomainConfiguration.test.ts` | Config builder/validator |
| `ServiceDomainIntegration.test.ts` | Service ↔ domain integration |

`domain/__tests__/` — `DomainExtendedDomain`, `DomainPatterns`, `DomainServices` cover the extended DDD model (specifications, policies, decorators, repository, events, handlers).

## Conventions
- Tests use the in-memory `DomainManager` directly — entities are plain `DomainEntity` fixtures (`{ id, createdAt, updatedAt }`).
- `HelloWorldMessage` tests exercise the real value objects (`MessageContent`, `CorrelationId`, `RequestId`, `Timestamp`), not mocks.
- Domain-layer validation failures are asserted as `{ success: false, error.code }`, not exceptions.
