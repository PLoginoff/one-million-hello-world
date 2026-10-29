# Testing: Scheduling Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/Scheduling.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/SchedulingStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `SchedulingStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/SchedulingConfiguration.test.ts` | `SchedulingConfigurationBuilder` fluent API and `SchedulingConfigurationValidator` limits |
| `domain/__tests__/SchedulingDomain.test.ts` | `SchedulingEntity`, `SchedulingValueObject`, `SchedulingDomainService` |
| `domain/__tests__/SchedulingExtendedDomain.test.ts` | `SchedulingExecution`, `SchedulingThreshold`, `SchedulingTimeWindow`, `SchedulingPriority`, `SchedulingExecuted`/`SchedulingFailed` events |
| `domain/__tests__/SchedulingPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `SchedulingEventObserver`, `SchedulingProcessingPipeline`, caching/logging decorators, `SchedulingEventHandler` |
| `domain/__tests__/SchedulingServices.test.ts` | Execution/validation/query services, `SchedulingInMemoryRepository`, `SchedulingMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/scheduling/
```

Single file:

```bash
bun test ./src/layers/scheduling/__tests__/SchedulingStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
