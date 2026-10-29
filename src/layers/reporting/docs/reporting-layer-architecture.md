# Reporting Layer Architecture

## Position
Data Layer 2

## Responsibility
Report generation and export in multiple formats.

## Structure

```
reporting/
├── index.ts                              — barrel export
├── interfaces/IReporting.ts                 — layer contract
├── implementations/Reporting.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — ReportingStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/ReportingHealthCheck.ts
├── metrics/ReportingPrometheusMetricsCollector.ts
├── statistics/ReportingMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — ReportingError, ReportingErrorMapper
```

## Components

### Core
- **`IReporting`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`Reporting`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IReportingStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `ReportingDefaultStrategy` | 0 | Standard balanced path |
| `ReportingFastStrategy` | 5 | Low-latency path |
| `ReportingReliableStrategy` | 10 | Correctness/durability emphasis |
| `ReportingCachedStrategy` | 7 | In-memory result caching |
| `ReportingBatchStrategy` | 3 | Bulk processing |

`ReportingStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `ReportingEntity`, `ReportingExecution`,
  `ReportingConfigState`, `ReportingMetricsSnapshot`.
- **Handlers**: `ReportingCommandHandler`, `ReportingQueryHandler`,
  `ReportingEventHandler` — CQRS-style dispatch.
- **Services**: `ReportingDomainService`/`ReportingExecutionService`,
  `ReportingQueryService`, `ReportingValidationService`.
- **Events**: `ReportingExecuted`, `ReportingFailed`.
- **Policies**: `ReportingAccessPolicy`, `ReportingRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IReportingSpecification`.
- **Decorators**: `ReportingCachingDecorator`,
  `ReportingLoggingDecorator`.
- **Value objects**: `ReportingPriority`, `ReportingThreshold`,
  `ReportingTimeWindow`, `ReportingValueObject`.
- **Pipeline**: `ReportingProcessingPipeline`.
- **Repository**: `ReportingInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `ReportingHealthCheck` — liveness/status probe.
- `ReportingPrometheusMetricsCollector` — Prometheus-format metrics.
- `ReportingMetricsCollector` — internal statistics.
- `ReportingError` / `ReportingErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IReporting`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
