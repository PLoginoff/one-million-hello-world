# Testing: Siem Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/Siem.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/SiemStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `SiemStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/SiemConfiguration.test.ts` | `SiemConfigurationBuilder` fluent API and `SiemConfigurationValidator` limits |
| `domain/__tests__/SiemDomain.test.ts` | `SiemEntity`, `SiemValueObject`, `SiemDomainService` |
| `domain/__tests__/SiemExtendedDomain.test.ts` | `SiemExecution`, `SiemThreshold`, `SiemTimeWindow`, `SiemPriority`, `SiemExecuted`/`SiemFailed` events |
| `domain/__tests__/SiemPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `SiemEventObserver`, `SiemProcessingPipeline`, caching/logging decorators, `SiemEventHandler` |
| `domain/__tests__/SiemServices.test.ts` | Execution/validation/query services, `SiemInMemoryRepository`, `SiemMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/siem/
```

Single file:

```bash
bun test ./src/layers/siem/__tests__/SiemStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
