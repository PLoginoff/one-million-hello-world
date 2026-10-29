# Testing: RulesEngine Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/RulesEngine.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/RulesEngineStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `RulesEngineStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/RulesEngineConfiguration.test.ts` | `RulesEngineConfigurationBuilder` fluent API and `RulesEngineConfigurationValidator` limits |
| `domain/__tests__/RulesEngineDomain.test.ts` | `RulesEngineEntity`, `RulesEngineValueObject`, `RulesEngineDomainService` |
| `domain/__tests__/RulesEngineExtendedDomain.test.ts` | `RulesEngineExecution`, `RulesEngineThreshold`, `RulesEngineTimeWindow`, `RulesEnginePriority`, `RulesEngineExecuted`/`RulesEngineFailed` events |
| `domain/__tests__/RulesEnginePatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `RulesEngineEventObserver`, `RulesEngineProcessingPipeline`, caching/logging decorators, `RulesEngineEventHandler` |
| `domain/__tests__/RulesEngineServices.test.ts` | Execution/validation/query services, `RulesEngineInMemoryRepository`, `RulesEngineMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/rules-engine/
```

Single file:

```bash
bun test ./src/layers/rules-engine/__tests__/RulesEngineStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
