# WriteModel Layer Architecture

## Position
Layer 54

## Responsibility
Write model and aggregate persistence. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `WriteModel` facade or a pluggable
strategy, and results come back as a `WriteModelResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`IWriteModel`** (`interfaces/`) — the layer contract.
- **`WriteModel`** (`implementations/WriteModel.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `IWriteModelStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `WriteModelDefaultStrategy` | 0 | Balanced pass-through execution. |
| `WriteModelFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `WriteModelReliableStrategy` | 5 | Reliability-oriented execution. |
| `WriteModelCachedStrategy` | 7 | Adds caching around execution. |
| `WriteModelBatchStrategy` | 3 | Batches executions. |

`WriteModelStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`WriteModelStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `WriteModelEntity`, `WriteModelExecution`,
  `WriteModelConfigState`, `WriteModelMetricsSnapshot`.
- **Value objects**: `WriteModelValueObject`, `WriteModelThreshold`,
  `WriteModelPriority`, `WriteModelTimeWindow`.
- **Services**: `WriteModelDomainService`, `WriteModelExecutionService`,
  `WriteModelValidationService`, `WriteModelQueryService`.
- **Patterns**: `WriteModelInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `WriteModelAccessPolicy`, `WriteModelRatePolicy`,
  `WriteModelProcessingPipeline`, `WriteModelCachingDecorator`,
  `WriteModelLoggingDecorator`, `WriteModelMapper`,
  `WriteModelEventObserver`, command/query/event handlers.
- **Events**: `WriteModelExecuted`, `WriteModelFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`IWriteModel` implementations for tests and local development.

### Cross-cutting
`WriteModelHealthCheck` (`health/`), `WriteModelMetricsCollector`
(`statistics/`), `WriteModelPrometheusMetricsCollector` (`metrics/`),
`WriteModelError`/`WriteModelErrorMapper` (`utils/`).

## Configuration
Builder (`WriteModelConfigurationBuilder`), validator
(`WriteModelConfigurationValidator`), and defaults/limits
(`WriteModelDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
