# UnitOfWork Layer Architecture

## Position
Layer 65

## Responsibility
Unit of work pattern. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `UnitOfWork` facade or a pluggable
strategy, and results come back as a `UnitOfWorkResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`IUnitOfWork`** (`interfaces/`) — the layer contract.
- **`UnitOfWork`** (`implementations/UnitOfWork.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `IUnitOfWorkStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `UnitOfWorkDefaultStrategy` | 0 | Balanced pass-through execution. |
| `UnitOfWorkFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `UnitOfWorkReliableStrategy` | 5 | Reliability-oriented execution. |
| `UnitOfWorkCachedStrategy` | 7 | Adds caching around execution. |
| `UnitOfWorkBatchStrategy` | 3 | Batches executions. |

`UnitOfWorkStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`UnitOfWorkStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `UnitOfWorkEntity`, `UnitOfWorkExecution`,
  `UnitOfWorkConfigState`, `UnitOfWorkMetricsSnapshot`.
- **Value objects**: `UnitOfWorkValueObject`, `UnitOfWorkThreshold`,
  `UnitOfWorkPriority`, `UnitOfWorkTimeWindow`.
- **Services**: `UnitOfWorkDomainService`, `UnitOfWorkExecutionService`,
  `UnitOfWorkValidationService`, `UnitOfWorkQueryService`.
- **Patterns**: `UnitOfWorkInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `UnitOfWorkAccessPolicy`, `UnitOfWorkRatePolicy`,
  `UnitOfWorkProcessingPipeline`, `UnitOfWorkCachingDecorator`,
  `UnitOfWorkLoggingDecorator`, `UnitOfWorkMapper`,
  `UnitOfWorkEventObserver`, command/query/event handlers.
- **Events**: `UnitOfWorkExecuted`, `UnitOfWorkFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`IUnitOfWork` implementations for tests and local development.

### Cross-cutting
`UnitOfWorkHealthCheck` (`health/`), `UnitOfWorkMetricsCollector`
(`statistics/`), `UnitOfWorkPrometheusMetricsCollector` (`metrics/`),
`UnitOfWorkError`/`UnitOfWorkErrorMapper` (`utils/`).

## Configuration
Builder (`UnitOfWorkConfigurationBuilder`), validator
(`UnitOfWorkConfigurationValidator`), and defaults/limits
(`UnitOfWorkDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
