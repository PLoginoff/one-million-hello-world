# Testing: Snapshot Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/Snapshot.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/SnapshotStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `SnapshotStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/SnapshotConfiguration.test.ts` | `SnapshotConfigurationBuilder` fluent API and `SnapshotConfigurationValidator` limits |
| `domain/__tests__/SnapshotDomain.test.ts` | `SnapshotEntity`, `SnapshotValueObject`, `SnapshotDomainService` |
| `domain/__tests__/SnapshotExtendedDomain.test.ts` | `SnapshotExecution`, `SnapshotThreshold`, `SnapshotTimeWindow`, `SnapshotPriority`, `SnapshotExecuted`/`SnapshotFailed` events |
| `domain/__tests__/SnapshotPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `SnapshotEventObserver`, `SnapshotProcessingPipeline`, caching/logging decorators, `SnapshotEventHandler` |
| `domain/__tests__/SnapshotServices.test.ts` | Execution/validation/query services, `SnapshotInMemoryRepository`, `SnapshotMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/snapshot/
```

Single file:

```bash
bun test ./src/layers/snapshot/__tests__/SnapshotStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
