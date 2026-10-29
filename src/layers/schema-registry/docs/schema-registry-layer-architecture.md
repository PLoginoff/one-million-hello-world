# SchemaRegistry Layer Architecture

## Position
Layer 35

## Responsibility
Schema registry and contract validation. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `SchemaRegistry` facade or a pluggable
strategy, and results come back as a `SchemaRegistryResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`ISchemaRegistry`** (`interfaces/`) — the layer contract.
- **`SchemaRegistry`** (`implementations/SchemaRegistry.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `ISchemaRegistryStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `SchemaRegistryDefaultStrategy` | 0 | Balanced pass-through execution. |
| `SchemaRegistryFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `SchemaRegistryReliableStrategy` | 5 | Reliability-oriented execution. |
| `SchemaRegistryCachedStrategy` | 7 | Adds caching around execution. |
| `SchemaRegistryBatchStrategy` | 3 | Batches executions. |

`SchemaRegistryStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`SchemaRegistryStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `SchemaRegistryEntity`, `SchemaRegistryExecution`,
  `SchemaRegistryConfigState`, `SchemaRegistryMetricsSnapshot`.
- **Value objects**: `SchemaRegistryValueObject`, `SchemaRegistryThreshold`,
  `SchemaRegistryPriority`, `SchemaRegistryTimeWindow`.
- **Services**: `SchemaRegistryDomainService`, `SchemaRegistryExecutionService`,
  `SchemaRegistryValidationService`, `SchemaRegistryQueryService`.
- **Patterns**: `SchemaRegistryInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `SchemaRegistryAccessPolicy`, `SchemaRegistryRatePolicy`,
  `SchemaRegistryProcessingPipeline`, `SchemaRegistryCachingDecorator`,
  `SchemaRegistryLoggingDecorator`, `SchemaRegistryMapper`,
  `SchemaRegistryEventObserver`, command/query/event handlers.
- **Events**: `SchemaRegistryExecuted`, `SchemaRegistryFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`ISchemaRegistry` implementations for tests and local development.

### Cross-cutting
`SchemaRegistryHealthCheck` (`health/`), `SchemaRegistryMetricsCollector`
(`statistics/`), `SchemaRegistryPrometheusMetricsCollector` (`metrics/`),
`SchemaRegistryError`/`SchemaRegistryErrorMapper` (`utils/`).

## Configuration
Builder (`SchemaRegistryConfigurationBuilder`), validator
(`SchemaRegistryConfigurationValidator`), and defaults/limits
(`SchemaRegistryDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
