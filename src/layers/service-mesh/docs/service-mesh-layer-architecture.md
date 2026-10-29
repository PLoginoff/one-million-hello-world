# ServiceMesh Layer Architecture

## Position
Layer 47

## Responsibility
Service mesh abstraction and sidecar pattern. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `ServiceMesh` facade or a pluggable
strategy, and results come back as a `ServiceMeshResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`IServiceMesh`** (`interfaces/`) — the layer contract.
- **`ServiceMesh`** (`implementations/ServiceMesh.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `IServiceMeshStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `ServiceMeshDefaultStrategy` | 0 | Balanced pass-through execution. |
| `ServiceMeshFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `ServiceMeshReliableStrategy` | 5 | Reliability-oriented execution. |
| `ServiceMeshCachedStrategy` | 7 | Adds caching around execution. |
| `ServiceMeshBatchStrategy` | 3 | Batches executions. |

`ServiceMeshStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`ServiceMeshStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `ServiceMeshEntity`, `ServiceMeshExecution`,
  `ServiceMeshConfigState`, `ServiceMeshMetricsSnapshot`.
- **Value objects**: `ServiceMeshValueObject`, `ServiceMeshThreshold`,
  `ServiceMeshPriority`, `ServiceMeshTimeWindow`.
- **Services**: `ServiceMeshDomainService`, `ServiceMeshExecutionService`,
  `ServiceMeshValidationService`, `ServiceMeshQueryService`.
- **Patterns**: `ServiceMeshInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `ServiceMeshAccessPolicy`, `ServiceMeshRatePolicy`,
  `ServiceMeshProcessingPipeline`, `ServiceMeshCachingDecorator`,
  `ServiceMeshLoggingDecorator`, `ServiceMeshMapper`,
  `ServiceMeshEventObserver`, command/query/event handlers.
- **Events**: `ServiceMeshExecuted`, `ServiceMeshFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`IServiceMesh` implementations for tests and local development.

### Cross-cutting
`ServiceMeshHealthCheck` (`health/`), `ServiceMeshMetricsCollector`
(`statistics/`), `ServiceMeshPrometheusMetricsCollector` (`metrics/`),
`ServiceMeshError`/`ServiceMeshErrorMapper` (`utils/`).

## Configuration
Builder (`ServiceMeshConfigurationBuilder`), validator
(`ServiceMeshConfigurationValidator`), and defaults/limits
(`ServiceMeshDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
