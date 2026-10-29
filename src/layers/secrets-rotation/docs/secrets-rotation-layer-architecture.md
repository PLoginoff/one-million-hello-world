# SecretsRotation Layer Architecture

## Position
Infra Layer 6

## Responsibility
Automated secret rotation and lifecycle management. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `SecretsRotation` facade or a pluggable
strategy, and results come back as a `SecretsRotationResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`ISecretsRotation`** (`interfaces/`) — the layer contract.
- **`SecretsRotation`** (`implementations/SecretsRotation.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `ISecretsRotationStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `SecretsRotationDefaultStrategy` | 0 | Balanced pass-through execution. |
| `SecretsRotationFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `SecretsRotationReliableStrategy` | 5 | Reliability-oriented execution. |
| `SecretsRotationCachedStrategy` | 7 | Adds caching around execution. |
| `SecretsRotationBatchStrategy` | 3 | Batches executions. |

`SecretsRotationStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.

### Domain (`domain/`)
- **Entities**: `SecretsRotationEntity`, `SecretsRotationExecution`,
  `SecretsRotationConfigState`, `SecretsRotationMetricsSnapshot`.
- **Value objects**: `SecretsRotationValueObject`, `SecretsRotationThreshold`,
  `SecretsRotationPriority`, `SecretsRotationTimeWindow`.
- **Services**: `SecretsRotationDomainService`, `SecretsRotationExecutionService`,
  `SecretsRotationValidationService`, `SecretsRotationQueryService`.
- **Patterns**: `SecretsRotationInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `SecretsRotationAccessPolicy`, `SecretsRotationRatePolicy`,
  `SecretsRotationProcessingPipeline`, `SecretsRotationCachingDecorator`,
  `SecretsRotationLoggingDecorator`, `SecretsRotationMapper`,
  `SecretsRotationEventObserver`, command/query/event handlers.
- **Events**: `SecretsRotationExecuted`, `SecretsRotationFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`ISecretsRotation` implementations for tests and local development.

### Cross-cutting
`SecretsRotationHealthCheck` (`health/`), `SecretsRotationMetricsCollector`
(`statistics/`), `SecretsRotationPrometheusMetricsCollector` (`metrics/`),
`SecretsRotationError`/`SecretsRotationErrorMapper` (`utils/`).

## Configuration
Builder (`SecretsRotationConfigurationBuilder`), validator
(`SecretsRotationConfigurationValidator`), and defaults/limits
(`SecretsRotationDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
