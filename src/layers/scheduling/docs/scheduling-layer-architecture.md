# Scheduling Layer Architecture

## Position
Infra Layer 3

## Responsibility
Cron-based and event-driven job scheduling. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `Scheduling` facade or a pluggable
strategy, and results come back as a `SchedulingResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`IScheduling`** (`interfaces/`) — the layer contract.
- **`Scheduling`** (`implementations/Scheduling.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `ISchedulingStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `SchedulingDefaultStrategy` | 0 | Balanced pass-through execution. |
| `SchedulingFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `SchedulingReliableStrategy` | 5 | Reliability-oriented execution. |
| `SchedulingCachedStrategy` | 7 | Adds caching around execution. |
| `SchedulingBatchStrategy` | 3 | Batches executions. |

`SchedulingStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.

### Domain (`domain/`)
- **Entities**: `SchedulingEntity`, `SchedulingExecution`,
  `SchedulingConfigState`, `SchedulingMetricsSnapshot`.
- **Value objects**: `SchedulingValueObject`, `SchedulingThreshold`,
  `SchedulingPriority`, `SchedulingTimeWindow`.
- **Services**: `SchedulingDomainService`, `SchedulingExecutionService`,
  `SchedulingValidationService`, `SchedulingQueryService`.
- **Patterns**: `SchedulingInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `SchedulingAccessPolicy`, `SchedulingRatePolicy`,
  `SchedulingProcessingPipeline`, `SchedulingCachingDecorator`,
  `SchedulingLoggingDecorator`, `SchedulingMapper`,
  `SchedulingEventObserver`, command/query/event handlers.
- **Events**: `SchedulingExecuted`, `SchedulingFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`IScheduling` implementations for tests and local development.

### Cross-cutting
`SchedulingHealthCheck` (`health/`), `SchedulingMetricsCollector`
(`statistics/`), `SchedulingPrometheusMetricsCollector` (`metrics/`),
`SchedulingError`/`SchedulingErrorMapper` (`utils/`).

## Configuration
Builder (`SchedulingConfigurationBuilder`), validator
(`SchedulingConfigurationValidator`), and defaults/limits
(`SchedulingDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
