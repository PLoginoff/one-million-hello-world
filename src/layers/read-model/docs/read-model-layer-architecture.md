# ReadModel Layer Architecture

## Position
Layer 53

## Responsibility
Read model projections.

## Structure

```
read-model/
├── index.ts                              — barrel export
├── interfaces/IReadModel.ts                 — layer contract
├── implementations/ReadModel.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — ReadModelFactory, ReadModelStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/ReadModelHealthCheck.ts
├── metrics/ReadModelPrometheusMetricsCollector.ts
├── statistics/ReadModelMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — ReadModelError, ReadModelErrorMapper
```

## Components

### Core
- **`IReadModel`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`ReadModel`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IReadModelStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `ReadModelDefaultStrategy` | 0 | Standard balanced path |
| `ReadModelFastStrategy` | 5 | Low-latency path |
| `ReadModelReliableStrategy` | 10 | Correctness/durability emphasis |
| `ReadModelCachedStrategy` | 7 | In-memory result caching |
| `ReadModelBatchStrategy` | 3 | Bulk processing |

`ReadModelStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `ReadModelEntity`, `ReadModelExecution`,
  `ReadModelConfigState`, `ReadModelMetricsSnapshot`.
- **Handlers**: `ReadModelCommandHandler`, `ReadModelQueryHandler`,
  `ReadModelEventHandler` — CQRS-style dispatch.
- **Services**: `ReadModelDomainService`/`ReadModelExecutionService`,
  `ReadModelQueryService`, `ReadModelValidationService`.
- **Events**: `ReadModelExecuted`, `ReadModelFailed`.
- **Policies**: `ReadModelAccessPolicy`, `ReadModelRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IReadModelSpecification`.
- **Decorators**: `ReadModelCachingDecorator`,
  `ReadModelLoggingDecorator`.
- **Value objects**: `ReadModelPriority`, `ReadModelThreshold`,
  `ReadModelTimeWindow`, `ReadModelValueObject`.
- **Pipeline**: `ReadModelProcessingPipeline`.
- **Repository**: `ReadModelInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `ReadModelHealthCheck` — liveness/status probe.
- `ReadModelPrometheusMetricsCollector` — Prometheus-format metrics.
- `ReadModelMetricsCollector` — internal statistics.
- `ReadModelError` / `ReadModelErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IReadModel`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
