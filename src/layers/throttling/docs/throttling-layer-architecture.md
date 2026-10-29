# Throttling Layer Architecture

## Position
Layer 44

## Responsibility
Throttling and quota management. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `Throttling` facade or a pluggable
strategy, and results come back as a `ThrottlingResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`IThrottling`** (`interfaces/`) — the layer contract.
- **`Throttling`** (`implementations/Throttling.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `IThrottlingStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `ThrottlingDefaultStrategy` | 0 | Balanced pass-through execution. |
| `ThrottlingFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `ThrottlingReliableStrategy` | 5 | Reliability-oriented execution. |
| `ThrottlingCachedStrategy` | 7 | Adds caching around execution. |
| `ThrottlingBatchStrategy` | 3 | Batches executions. |

`ThrottlingStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`ThrottlingStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `ThrottlingEntity`, `ThrottlingExecution`,
  `ThrottlingConfigState`, `ThrottlingMetricsSnapshot`.
- **Value objects**: `ThrottlingValueObject`, `ThrottlingThreshold`,
  `ThrottlingPriority`, `ThrottlingTimeWindow`.
- **Services**: `ThrottlingDomainService`, `ThrottlingExecutionService`,
  `ThrottlingValidationService`, `ThrottlingQueryService`.
- **Patterns**: `ThrottlingInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `ThrottlingAccessPolicy`, `ThrottlingRatePolicy`,
  `ThrottlingProcessingPipeline`, `ThrottlingCachingDecorator`,
  `ThrottlingLoggingDecorator`, `ThrottlingMapper`,
  `ThrottlingEventObserver`, command/query/event handlers.
- **Events**: `ThrottlingExecuted`, `ThrottlingFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`IThrottling` implementations for tests and local development.

### Cross-cutting
`ThrottlingHealthCheck` (`health/`), `ThrottlingMetricsCollector`
(`statistics/`), `ThrottlingPrometheusMetricsCollector` (`metrics/`),
`ThrottlingError`/`ThrottlingErrorMapper` (`utils/`).

## Configuration
Builder (`ThrottlingConfigurationBuilder`), validator
(`ThrottlingConfigurationValidator`), and defaults/limits
(`ThrottlingDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
