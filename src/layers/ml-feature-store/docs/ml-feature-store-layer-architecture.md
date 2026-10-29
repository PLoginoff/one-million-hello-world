# MlFeatureStore Layer Architecture

## Position
ML Layer 2

## Responsibility
ML feature storage, serving, and versioning.

## Structure

```
ml-feature-store/
├── index.ts                              — barrel export
├── interfaces/IMlFeatureStore.ts                 — layer contract
├── implementations/MlFeatureStore.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — MlFeatureStoreStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/MlFeatureStoreHealthCheck.ts
├── metrics/MlFeatureStorePrometheusMetricsCollector.ts
├── statistics/MlFeatureStoreMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — MlFeatureStoreError, MlFeatureStoreErrorMapper
```

## Components

### Core
- **`IMlFeatureStore`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`MlFeatureStore`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IMlFeatureStoreStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `MlFeatureStoreDefaultStrategy` | 0 | Standard balanced path |
| `MlFeatureStoreFastStrategy` | 5 | Low-latency path |
| `MlFeatureStoreReliableStrategy` | 10 | Correctness/durability emphasis |
| `MlFeatureStoreCachedStrategy` | 7 | In-memory result caching |
| `MlFeatureStoreBatchStrategy` | 3 | Bulk processing |

`MlFeatureStoreStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `MlFeatureStoreEntity`, `MlFeatureStoreExecution`,
  `MlFeatureStoreConfigState`, `MlFeatureStoreMetricsSnapshot`.
- **Handlers**: `MlFeatureStoreCommandHandler`, `MlFeatureStoreQueryHandler`,
  `MlFeatureStoreEventHandler` — CQRS-style dispatch.
- **Services**: `MlFeatureStoreDomainService`/`MlFeatureStoreExecutionService`,
  `MlFeatureStoreQueryService`, `MlFeatureStoreValidationService`.
- **Events**: `MlFeatureStoreExecuted`, `MlFeatureStoreFailed`.
- **Policies**: `MlFeatureStoreAccessPolicy`, `MlFeatureStoreRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IMlFeatureStoreSpecification`.
- **Decorators**: `MlFeatureStoreCachingDecorator`,
  `MlFeatureStoreLoggingDecorator`.
- **Value objects**: `MlFeatureStorePriority`, `MlFeatureStoreThreshold`,
  `MlFeatureStoreTimeWindow`, `MlFeatureStoreValueObject`.
- **Pipeline**: `MlFeatureStoreProcessingPipeline`.
- **Repository**: `MlFeatureStoreInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `MlFeatureStoreHealthCheck` — liveness/status probe.
- `MlFeatureStorePrometheusMetricsCollector` — Prometheus-format metrics.
- `MlFeatureStoreMetricsCollector` — internal statistics.
- `MlFeatureStoreError` / `MlFeatureStoreErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IMlFeatureStore`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
