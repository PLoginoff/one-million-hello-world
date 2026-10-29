# PerformanceTesting Layer Architecture

## Position
Layer 83

## Responsibility
Performance and load testing.

## Structure

```
performance-testing/
├── index.ts                              — barrel export
├── interfaces/IPerformanceTesting.ts                 — layer contract
├── implementations/PerformanceTesting.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — PerformanceTestingFactory, PerformanceTestingStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/PerformanceTestingHealthCheck.ts
├── metrics/PerformanceTestingPrometheusMetricsCollector.ts
├── statistics/PerformanceTestingMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — PerformanceTestingError, PerformanceTestingErrorMapper
```

## Components

### Core
- **`IPerformanceTesting`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`PerformanceTesting`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IPerformanceTestingStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `PerformanceTestingDefaultStrategy` | 0 | Standard balanced path |
| `PerformanceTestingFastStrategy` | 5 | Low-latency path |
| `PerformanceTestingReliableStrategy` | 10 | Correctness/durability emphasis |
| `PerformanceTestingCachedStrategy` | 7 | In-memory result caching |
| `PerformanceTestingBatchStrategy` | 3 | Bulk processing |

`PerformanceTestingStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `PerformanceTestingEntity`, `PerformanceTestingExecution`,
  `PerformanceTestingConfigState`, `PerformanceTestingMetricsSnapshot`.
- **Handlers**: `PerformanceTestingCommandHandler`, `PerformanceTestingQueryHandler`,
  `PerformanceTestingEventHandler` — CQRS-style dispatch.
- **Services**: `PerformanceTestingDomainService`/`PerformanceTestingExecutionService`,
  `PerformanceTestingQueryService`, `PerformanceTestingValidationService`.
- **Events**: `PerformanceTestingExecuted`, `PerformanceTestingFailed`.
- **Policies**: `PerformanceTestingAccessPolicy`, `PerformanceTestingRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IPerformanceTestingSpecification`.
- **Decorators**: `PerformanceTestingCachingDecorator`,
  `PerformanceTestingLoggingDecorator`.
- **Value objects**: `PerformanceTestingPriority`, `PerformanceTestingThreshold`,
  `PerformanceTestingTimeWindow`, `PerformanceTestingValueObject`.
- **Pipeline**: `PerformanceTestingProcessingPipeline`.
- **Repository**: `PerformanceTestingInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `PerformanceTestingHealthCheck` — liveness/status probe.
- `PerformanceTestingPrometheusMetricsCollector` — Prometheus-format metrics.
- `PerformanceTestingMetricsCollector` — internal statistics.
- `PerformanceTestingError` / `PerformanceTestingErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IPerformanceTesting`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
