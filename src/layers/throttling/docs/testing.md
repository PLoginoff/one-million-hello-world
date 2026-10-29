# Testing: Throttling Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/Throttling.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/ThrottlingStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `ThrottlingStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/ThrottlingConfiguration.test.ts` | `ThrottlingConfigurationBuilder` fluent API and `ThrottlingConfigurationValidator` limits |
| `domain/__tests__/ThrottlingDomain.test.ts` | `ThrottlingEntity`, `ThrottlingValueObject`, `ThrottlingDomainService` |
| `domain/__tests__/ThrottlingExtendedDomain.test.ts` | `ThrottlingExecution`, `ThrottlingThreshold`, `ThrottlingTimeWindow`, `ThrottlingPriority`, `ThrottlingExecuted`/`ThrottlingFailed` events |
| `domain/__tests__/ThrottlingPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `ThrottlingEventObserver`, `ThrottlingProcessingPipeline`, caching/logging decorators, `ThrottlingEventHandler` |
| `domain/__tests__/ThrottlingServices.test.ts` | Execution/validation/query services, `ThrottlingInMemoryRepository`, `ThrottlingMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/throttling/
```

Single file:

```bash
bun test ./src/layers/throttling/__tests__/ThrottlingStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
