# Testing: WriteModel Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/WriteModel.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/WriteModelStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `WriteModelStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/WriteModelConfiguration.test.ts` | `WriteModelConfigurationBuilder` fluent API and `WriteModelConfigurationValidator` limits |
| `domain/__tests__/WriteModelDomain.test.ts` | `WriteModelEntity`, `WriteModelValueObject`, `WriteModelDomainService` |
| `domain/__tests__/WriteModelExtendedDomain.test.ts` | `WriteModelExecution`, `WriteModelThreshold`, `WriteModelTimeWindow`, `WriteModelPriority`, `WriteModelExecuted`/`WriteModelFailed` events |
| `domain/__tests__/WriteModelPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `WriteModelEventObserver`, `WriteModelProcessingPipeline`, caching/logging decorators, `WriteModelEventHandler` |
| `domain/__tests__/WriteModelServices.test.ts` | Execution/validation/query services, `WriteModelInMemoryRepository`, `WriteModelMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/write-model/
```

Single file:

```bash
bun test ./src/layers/write-model/__tests__/WriteModelStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
