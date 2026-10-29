# Testing: UnitOfWork Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/UnitOfWork.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/UnitOfWorkStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `UnitOfWorkStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/UnitOfWorkConfiguration.test.ts` | `UnitOfWorkConfigurationBuilder` fluent API and `UnitOfWorkConfigurationValidator` limits |
| `domain/__tests__/UnitOfWorkDomain.test.ts` | `UnitOfWorkEntity`, `UnitOfWorkValueObject`, `UnitOfWorkDomainService` |
| `domain/__tests__/UnitOfWorkExtendedDomain.test.ts` | `UnitOfWorkExecution`, `UnitOfWorkThreshold`, `UnitOfWorkTimeWindow`, `UnitOfWorkPriority`, `UnitOfWorkExecuted`/`UnitOfWorkFailed` events |
| `domain/__tests__/UnitOfWorkPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `UnitOfWorkEventObserver`, `UnitOfWorkProcessingPipeline`, caching/logging decorators, `UnitOfWorkEventHandler` |
| `domain/__tests__/UnitOfWorkServices.test.ts` | Execution/validation/query services, `UnitOfWorkInMemoryRepository`, `UnitOfWorkMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/unit-of-work/
```

Single file:

```bash
bun test ./src/layers/unit-of-work/__tests__/UnitOfWorkStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
