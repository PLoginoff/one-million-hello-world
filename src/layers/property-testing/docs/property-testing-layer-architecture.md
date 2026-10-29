# PropertyTesting Layer Architecture

## Position
Layer 85

## Responsibility
Property-based testing.

## Structure

```
property-testing/
├── index.ts                              — barrel export
├── interfaces/IPropertyTesting.ts                 — layer contract
├── implementations/PropertyTesting.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — PropertyTestingFactory, PropertyTestingStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/PropertyTestingHealthCheck.ts
├── metrics/PropertyTestingPrometheusMetricsCollector.ts
├── statistics/PropertyTestingMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — PropertyTestingError, PropertyTestingErrorMapper
```

## Components

### Core
- **`IPropertyTesting`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`PropertyTesting`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IPropertyTestingStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `PropertyTestingDefaultStrategy` | 0 | Standard balanced path |
| `PropertyTestingFastStrategy` | 5 | Low-latency path |
| `PropertyTestingReliableStrategy` | 10 | Correctness/durability emphasis |
| `PropertyTestingCachedStrategy` | 7 | In-memory result caching |
| `PropertyTestingBatchStrategy` | 3 | Bulk processing |

`PropertyTestingStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `PropertyTestingEntity`, `PropertyTestingExecution`,
  `PropertyTestingConfigState`, `PropertyTestingMetricsSnapshot`.
- **Handlers**: `PropertyTestingCommandHandler`, `PropertyTestingQueryHandler`,
  `PropertyTestingEventHandler` — CQRS-style dispatch.
- **Services**: `PropertyTestingDomainService`/`PropertyTestingExecutionService`,
  `PropertyTestingQueryService`, `PropertyTestingValidationService`.
- **Events**: `PropertyTestingExecuted`, `PropertyTestingFailed`.
- **Policies**: `PropertyTestingAccessPolicy`, `PropertyTestingRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IPropertyTestingSpecification`.
- **Decorators**: `PropertyTestingCachingDecorator`,
  `PropertyTestingLoggingDecorator`.
- **Value objects**: `PropertyTestingPriority`, `PropertyTestingThreshold`,
  `PropertyTestingTimeWindow`, `PropertyTestingValueObject`.
- **Pipeline**: `PropertyTestingProcessingPipeline`.
- **Repository**: `PropertyTestingInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `PropertyTestingHealthCheck` — liveness/status probe.
- `PropertyTestingPrometheusMetricsCollector` — Prometheus-format metrics.
- `PropertyTestingMetricsCollector` — internal statistics.
- `PropertyTestingError` / `PropertyTestingErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IPropertyTesting`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
