# Testing: StreamProcessing Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/StreamProcessing.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/StreamProcessingStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `StreamProcessingStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/StreamProcessingConfiguration.test.ts` | `StreamProcessingConfigurationBuilder` fluent API and `StreamProcessingConfigurationValidator` limits |
| `domain/__tests__/StreamProcessingDomain.test.ts` | `StreamProcessingEntity`, `StreamProcessingValueObject`, `StreamProcessingDomainService` |
| `domain/__tests__/StreamProcessingExtendedDomain.test.ts` | `StreamProcessingExecution`, `StreamProcessingThreshold`, `StreamProcessingTimeWindow`, `StreamProcessingPriority`, `StreamProcessingExecuted`/`StreamProcessingFailed` events |
| `domain/__tests__/StreamProcessingPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `StreamProcessingEventObserver`, `StreamProcessingProcessingPipeline`, caching/logging decorators, `StreamProcessingEventHandler` |
| `domain/__tests__/StreamProcessingServices.test.ts` | Execution/validation/query services, `StreamProcessingInMemoryRepository`, `StreamProcessingMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/stream-processing/
```

Single file:

```bash
bun test ./src/layers/stream-processing/__tests__/StreamProcessingStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
