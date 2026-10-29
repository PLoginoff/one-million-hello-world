# RulesEngine Layer Architecture

## Position
Layer 61

## Responsibility
Business rules engine. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `RulesEngine` facade or a pluggable
strategy, and results come back as a `RulesEngineResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`IRulesEngine`** (`interfaces/`) — the layer contract.
- **`RulesEngine`** (`implementations/RulesEngine.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `IRulesEngineStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `RulesEngineDefaultStrategy` | 0 | Balanced pass-through execution. |
| `RulesEngineFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `RulesEngineReliableStrategy` | 5 | Reliability-oriented execution. |
| `RulesEngineCachedStrategy` | 7 | Adds caching around execution. |
| `RulesEngineBatchStrategy` | 3 | Batches executions. |

`RulesEngineStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`RulesEngineStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `RulesEngineEntity`, `RulesEngineExecution`,
  `RulesEngineConfigState`, `RulesEngineMetricsSnapshot`.
- **Value objects**: `RulesEngineValueObject`, `RulesEngineThreshold`,
  `RulesEnginePriority`, `RulesEngineTimeWindow`.
- **Services**: `RulesEngineDomainService`, `RulesEngineExecutionService`,
  `RulesEngineValidationService`, `RulesEngineQueryService`.
- **Patterns**: `RulesEngineInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `RulesEngineAccessPolicy`, `RulesEngineRatePolicy`,
  `RulesEngineProcessingPipeline`, `RulesEngineCachingDecorator`,
  `RulesEngineLoggingDecorator`, `RulesEngineMapper`,
  `RulesEngineEventObserver`, command/query/event handlers.
- **Events**: `RulesEngineExecuted`, `RulesEngineFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`IRulesEngine` implementations for tests and local development.

### Cross-cutting
`RulesEngineHealthCheck` (`health/`), `RulesEngineMetricsCollector`
(`statistics/`), `RulesEnginePrometheusMetricsCollector` (`metrics/`),
`RulesEngineError`/`RulesEngineErrorMapper` (`utils/`).

## Configuration
Builder (`RulesEngineConfigurationBuilder`), validator
(`RulesEngineConfigurationValidator`), and defaults/limits
(`RulesEngineDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
