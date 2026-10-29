# Snapshot Layer Architecture

## Position
Layer 55

## Responsibility
Snapshot storage and optimization. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `Snapshot` facade or a pluggable
strategy, and results come back as a `SnapshotResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`ISnapshot`** (`interfaces/`) — the layer contract.
- **`Snapshot`** (`implementations/Snapshot.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `ISnapshotStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `SnapshotDefaultStrategy` | 0 | Balanced pass-through execution. |
| `SnapshotFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `SnapshotReliableStrategy` | 5 | Reliability-oriented execution. |
| `SnapshotCachedStrategy` | 7 | Adds caching around execution. |
| `SnapshotBatchStrategy` | 3 | Batches executions. |

`SnapshotStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`SnapshotStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `SnapshotEntity`, `SnapshotExecution`,
  `SnapshotConfigState`, `SnapshotMetricsSnapshot`.
- **Value objects**: `SnapshotValueObject`, `SnapshotThreshold`,
  `SnapshotPriority`, `SnapshotTimeWindow`.
- **Services**: `SnapshotDomainService`, `SnapshotExecutionService`,
  `SnapshotValidationService`, `SnapshotQueryService`.
- **Patterns**: `SnapshotInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `SnapshotAccessPolicy`, `SnapshotRatePolicy`,
  `SnapshotProcessingPipeline`, `SnapshotCachingDecorator`,
  `SnapshotLoggingDecorator`, `SnapshotMapper`,
  `SnapshotEventObserver`, command/query/event handlers.
- **Events**: `SnapshotExecuted`, `SnapshotFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`ISnapshot` implementations for tests and local development.

### Cross-cutting
`SnapshotHealthCheck` (`health/`), `SnapshotMetricsCollector`
(`statistics/`), `SnapshotPrometheusMetricsCollector` (`metrics/`),
`SnapshotError`/`SnapshotErrorMapper` (`utils/`).

## Configuration
Builder (`SnapshotConfigurationBuilder`), validator
(`SnapshotConfigurationValidator`), and defaults/limits
(`SnapshotDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
