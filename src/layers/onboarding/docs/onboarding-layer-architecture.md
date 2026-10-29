# Onboarding Layer Architecture

## Position
Product Layer 4

## Responsibility
User onboarding flows and step tracking.

## Structure

```
onboarding/
├── index.ts                              — barrel export
├── interfaces/IOnboarding.ts                 — layer contract
├── implementations/Onboarding.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — OnboardingStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/OnboardingHealthCheck.ts
├── metrics/OnboardingPrometheusMetricsCollector.ts
├── statistics/OnboardingMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — OnboardingError, OnboardingErrorMapper
```

## Components

### Core
- **`IOnboarding`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`Onboarding`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IOnboardingStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `OnboardingDefaultStrategy` | 0 | Standard balanced path |
| `OnboardingFastStrategy` | 5 | Low-latency path |
| `OnboardingReliableStrategy` | 10 | Correctness/durability emphasis |
| `OnboardingCachedStrategy` | 7 | In-memory result caching |
| `OnboardingBatchStrategy` | 3 | Bulk processing |

`OnboardingStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `OnboardingEntity`, `OnboardingExecution`,
  `OnboardingConfigState`, `OnboardingMetricsSnapshot`.
- **Handlers**: `OnboardingCommandHandler`, `OnboardingQueryHandler`,
  `OnboardingEventHandler` — CQRS-style dispatch.
- **Services**: `OnboardingDomainService`/`OnboardingExecutionService`,
  `OnboardingQueryService`, `OnboardingValidationService`.
- **Events**: `OnboardingExecuted`, `OnboardingFailed`.
- **Policies**: `OnboardingAccessPolicy`, `OnboardingRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IOnboardingSpecification`.
- **Decorators**: `OnboardingCachingDecorator`,
  `OnboardingLoggingDecorator`.
- **Value objects**: `OnboardingPriority`, `OnboardingThreshold`,
  `OnboardingTimeWindow`, `OnboardingValueObject`.
- **Pipeline**: `OnboardingProcessingPipeline`.
- **Repository**: `OnboardingInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `OnboardingHealthCheck` — liveness/status probe.
- `OnboardingPrometheusMetricsCollector` — Prometheus-format metrics.
- `OnboardingMetricsCollector` — internal statistics.
- `OnboardingError` / `OnboardingErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IOnboarding`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
