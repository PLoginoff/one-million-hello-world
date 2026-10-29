# Siem Layer Architecture

## Position
Layer 75

## Responsibility
Security information and event management. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `Siem` facade or a pluggable
strategy, and results come back as a `SiemResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`ISiem`** (`interfaces/`) — the layer contract.
- **`Siem`** (`implementations/Siem.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `ISiemStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `SiemDefaultStrategy` | 0 | Balanced pass-through execution. |
| `SiemFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `SiemReliableStrategy` | 5 | Reliability-oriented execution. |
| `SiemCachedStrategy` | 7 | Adds caching around execution. |
| `SiemBatchStrategy` | 3 | Batches executions. |

`SiemStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`SiemStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `SiemEntity`, `SiemExecution`,
  `SiemConfigState`, `SiemMetricsSnapshot`.
- **Value objects**: `SiemValueObject`, `SiemThreshold`,
  `SiemPriority`, `SiemTimeWindow`.
- **Services**: `SiemDomainService`, `SiemExecutionService`,
  `SiemValidationService`, `SiemQueryService`.
- **Patterns**: `SiemInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `SiemAccessPolicy`, `SiemRatePolicy`,
  `SiemProcessingPipeline`, `SiemCachingDecorator`,
  `SiemLoggingDecorator`, `SiemMapper`,
  `SiemEventObserver`, command/query/event handlers.
- **Events**: `SiemExecuted`, `SiemFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`ISiem` implementations for tests and local development.

### Cross-cutting
`SiemHealthCheck` (`health/`), `SiemMetricsCollector`
(`statistics/`), `SiemPrometheusMetricsCollector` (`metrics/`),
`SiemError`/`SiemErrorMapper` (`utils/`).

## Configuration
Builder (`SiemConfigurationBuilder`), validator
(`SiemConfigurationValidator`), and defaults/limits
(`SiemDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
