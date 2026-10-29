# StreamProcessing Layer Architecture

## Position
Layer 79

## Responsibility
Stream processing abstraction. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `StreamProcessing` facade or a pluggable
strategy, and results come back as a `StreamProcessingResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`IStreamProcessing`** (`interfaces/`) — the layer contract.
- **`StreamProcessing`** (`implementations/StreamProcessing.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `IStreamProcessingStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `StreamProcessingDefaultStrategy` | 0 | Balanced pass-through execution. |
| `StreamProcessingFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `StreamProcessingReliableStrategy` | 5 | Reliability-oriented execution. |
| `StreamProcessingCachedStrategy` | 7 | Adds caching around execution. |
| `StreamProcessingBatchStrategy` | 3 | Batches executions. |

`StreamProcessingStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`StreamProcessingStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `StreamProcessingEntity`, `StreamProcessingExecution`,
  `StreamProcessingConfigState`, `StreamProcessingMetricsSnapshot`.
- **Value objects**: `StreamProcessingValueObject`, `StreamProcessingThreshold`,
  `StreamProcessingPriority`, `StreamProcessingTimeWindow`.
- **Services**: `StreamProcessingDomainService`, `StreamProcessingExecutionService`,
  `StreamProcessingValidationService`, `StreamProcessingQueryService`.
- **Patterns**: `StreamProcessingInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `StreamProcessingAccessPolicy`, `StreamProcessingRatePolicy`,
  `StreamProcessingProcessingPipeline`, `StreamProcessingCachingDecorator`,
  `StreamProcessingLoggingDecorator`, `StreamProcessingMapper`,
  `StreamProcessingEventObserver`, command/query/event handlers.
- **Events**: `StreamProcessingExecuted`, `StreamProcessingFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`IStreamProcessing` implementations for tests and local development.

### Cross-cutting
`StreamProcessingHealthCheck` (`health/`), `StreamProcessingMetricsCollector`
(`statistics/`), `StreamProcessingPrometheusMetricsCollector` (`metrics/`),
`StreamProcessingError`/`StreamProcessingErrorMapper` (`utils/`).

## Configuration
Builder (`StreamProcessingConfigurationBuilder`), validator
(`StreamProcessingConfigurationValidator`), and defaults/limits
(`StreamProcessingDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
