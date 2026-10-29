# MultiTenancy Layer Architecture

## Position
Product Layer 1

## Responsibility
Multi-tenant context and isolation strategies.

## Structure

```
multi-tenancy/
├── index.ts                              — barrel export
├── interfaces/IMultiTenancy.ts                 — layer contract
├── implementations/MultiTenancy.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — MultiTenancyStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/MultiTenancyHealthCheck.ts
├── metrics/MultiTenancyPrometheusMetricsCollector.ts
├── statistics/MultiTenancyMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — MultiTenancyError, MultiTenancyErrorMapper
```

## Components

### Core
- **`IMultiTenancy`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`MultiTenancy`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IMultiTenancyStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `MultiTenancyDefaultStrategy` | 0 | Standard balanced path |
| `MultiTenancyFastStrategy` | 5 | Low-latency path |
| `MultiTenancyReliableStrategy` | 10 | Correctness/durability emphasis |
| `MultiTenancyCachedStrategy` | 7 | In-memory result caching |
| `MultiTenancyBatchStrategy` | 3 | Bulk processing |

`MultiTenancyStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `MultiTenancyEntity`, `MultiTenancyExecution`,
  `MultiTenancyConfigState`, `MultiTenancyMetricsSnapshot`.
- **Handlers**: `MultiTenancyCommandHandler`, `MultiTenancyQueryHandler`,
  `MultiTenancyEventHandler` — CQRS-style dispatch.
- **Services**: `MultiTenancyDomainService`/`MultiTenancyExecutionService`,
  `MultiTenancyQueryService`, `MultiTenancyValidationService`.
- **Events**: `MultiTenancyExecuted`, `MultiTenancyFailed`.
- **Policies**: `MultiTenancyAccessPolicy`, `MultiTenancyRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IMultiTenancySpecification`.
- **Decorators**: `MultiTenancyCachingDecorator`,
  `MultiTenancyLoggingDecorator`.
- **Value objects**: `MultiTenancyPriority`, `MultiTenancyThreshold`,
  `MultiTenancyTimeWindow`, `MultiTenancyValueObject`.
- **Pipeline**: `MultiTenancyProcessingPipeline`.
- **Repository**: `MultiTenancyInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `MultiTenancyHealthCheck` — liveness/status probe.
- `MultiTenancyPrometheusMetricsCollector` — Prometheus-format metrics.
- `MultiTenancyMetricsCollector` — internal statistics.
- `MultiTenancyError` / `MultiTenancyErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IMultiTenancy`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
