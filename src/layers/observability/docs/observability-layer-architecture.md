# Observability Layer Architecture

## Position
Layer 33

## Responsibility
Metrics, logs and traces aggregation.

## Structure

```
observability/
├── index.ts                              — barrel export
├── interfaces/IObservability.ts                 — layer contract
├── implementations/Observability.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — ObservabilityFactory, ObservabilityStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/ObservabilityHealthCheck.ts
├── metrics/ObservabilityPrometheusMetricsCollector.ts
├── statistics/ObservabilityMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — ObservabilityError, ObservabilityErrorMapper
```

## Components

### Core
- **`IObservability`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`Observability`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IObservabilityStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `ObservabilityDefaultStrategy` | 0 | Standard balanced path |
| `ObservabilityFastStrategy` | 5 | Low-latency path |
| `ObservabilityReliableStrategy` | 10 | Correctness/durability emphasis |
| `ObservabilityCachedStrategy` | 7 | In-memory result caching |
| `ObservabilityBatchStrategy` | 3 | Bulk processing |

`ObservabilityStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `ObservabilityEntity`, `ObservabilityExecution`,
  `ObservabilityConfigState`, `ObservabilityMetricsSnapshot`.
- **Handlers**: `ObservabilityCommandHandler`, `ObservabilityQueryHandler`,
  `ObservabilityEventHandler` — CQRS-style dispatch.
- **Services**: `ObservabilityDomainService`/`ObservabilityExecutionService`,
  `ObservabilityQueryService`, `ObservabilityValidationService`.
- **Events**: `ObservabilityExecuted`, `ObservabilityFailed`.
- **Policies**: `ObservabilityAccessPolicy`, `ObservabilityRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IObservabilitySpecification`.
- **Decorators**: `ObservabilityCachingDecorator`,
  `ObservabilityLoggingDecorator`.
- **Value objects**: `ObservabilityPriority`, `ObservabilityThreshold`,
  `ObservabilityTimeWindow`, `ObservabilityValueObject`.
- **Pipeline**: `ObservabilityProcessingPipeline`.
- **Repository**: `ObservabilityInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `ObservabilityHealthCheck` — liveness/status probe.
- `ObservabilityPrometheusMetricsCollector` — Prometheus-format metrics.
- `ObservabilityMetricsCollector` — internal statistics.
- `ObservabilityError` / `ObservabilityErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IObservability`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
