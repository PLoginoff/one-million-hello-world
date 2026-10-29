# Testing: Specification Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/Specification.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/SpecificationStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `SpecificationStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/SpecificationConfiguration.test.ts` | `SpecificationConfigurationBuilder` fluent API and `SpecificationConfigurationValidator` limits |
| `domain/__tests__/SpecificationDomain.test.ts` | `SpecificationEntity`, `SpecificationValueObject`, `SpecificationDomainService` |
| `domain/__tests__/SpecificationExtendedDomain.test.ts` | `SpecificationExecution`, `SpecificationThreshold`, `SpecificationTimeWindow`, `SpecificationPriority`, `SpecificationExecuted`/`SpecificationFailed` events |
| `domain/__tests__/SpecificationPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `SpecificationEventObserver`, `SpecificationProcessingPipeline`, caching/logging decorators, `SpecificationEventHandler` |
| `domain/__tests__/SpecificationServices.test.ts` | Execution/validation/query services, `SpecificationInMemoryRepository`, `SpecificationMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/specification/
```

Single file:

```bash
bun test ./src/layers/specification/__tests__/SpecificationStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
