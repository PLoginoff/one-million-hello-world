# MutationTesting Layer Architecture

## Position
Layer 84

## Responsibility
Mutation testing.

## Structure

```
mutation-testing/
├── index.ts                              — barrel export
├── interfaces/IMutationTesting.ts                 — layer contract
├── implementations/MutationTesting.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — MutationTestingFactory, MutationTestingStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/MutationTestingHealthCheck.ts
├── metrics/MutationTestingPrometheusMetricsCollector.ts
├── statistics/MutationTestingMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — MutationTestingError, MutationTestingErrorMapper
```

## Components

### Core
- **`IMutationTesting`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`MutationTesting`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IMutationTestingStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `MutationTestingDefaultStrategy` | 0 | Standard balanced path |
| `MutationTestingFastStrategy` | 5 | Low-latency path |
| `MutationTestingReliableStrategy` | 10 | Correctness/durability emphasis |
| `MutationTestingCachedStrategy` | 7 | In-memory result caching |
| `MutationTestingBatchStrategy` | 3 | Bulk processing |

`MutationTestingStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `MutationTestingEntity`, `MutationTestingExecution`,
  `MutationTestingConfigState`, `MutationTestingMetricsSnapshot`.
- **Handlers**: `MutationTestingCommandHandler`, `MutationTestingQueryHandler`,
  `MutationTestingEventHandler` — CQRS-style dispatch.
- **Services**: `MutationTestingDomainService`/`MutationTestingExecutionService`,
  `MutationTestingQueryService`, `MutationTestingValidationService`.
- **Events**: `MutationTestingExecuted`, `MutationTestingFailed`.
- **Policies**: `MutationTestingAccessPolicy`, `MutationTestingRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IMutationTestingSpecification`.
- **Decorators**: `MutationTestingCachingDecorator`,
  `MutationTestingLoggingDecorator`.
- **Value objects**: `MutationTestingPriority`, `MutationTestingThreshold`,
  `MutationTestingTimeWindow`, `MutationTestingValueObject`.
- **Pipeline**: `MutationTestingProcessingPipeline`.
- **Repository**: `MutationTestingInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `MutationTestingHealthCheck` — liveness/status probe.
- `MutationTestingPrometheusMetricsCollector` — Prometheus-format metrics.
- `MutationTestingMetricsCollector` — internal statistics.
- `MutationTestingError` / `MutationTestingErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IMutationTesting`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
