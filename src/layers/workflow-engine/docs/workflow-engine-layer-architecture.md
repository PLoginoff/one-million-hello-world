# WorkflowEngine Layer Architecture

## Position
Layer 59

## Responsibility
Workflow engine and state machines. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `WorkflowEngine` facade or a pluggable
strategy, and results come back as a `WorkflowEngineResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`IWorkflowEngine`** (`interfaces/`) — the layer contract.
- **`WorkflowEngine`** (`implementations/WorkflowEngine.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `IWorkflowEngineStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `WorkflowEngineDefaultStrategy` | 0 | Balanced pass-through execution. |
| `WorkflowEngineFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `WorkflowEngineReliableStrategy` | 5 | Reliability-oriented execution. |
| `WorkflowEngineCachedStrategy` | 7 | Adds caching around execution. |
| `WorkflowEngineBatchStrategy` | 3 | Batches executions. |

`WorkflowEngineStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`WorkflowEngineStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `WorkflowEngineEntity`, `WorkflowEngineExecution`,
  `WorkflowEngineConfigState`, `WorkflowEngineMetricsSnapshot`.
- **Value objects**: `WorkflowEngineValueObject`, `WorkflowEngineThreshold`,
  `WorkflowEnginePriority`, `WorkflowEngineTimeWindow`.
- **Services**: `WorkflowEngineDomainService`, `WorkflowEngineExecutionService`,
  `WorkflowEngineValidationService`, `WorkflowEngineQueryService`.
- **Patterns**: `WorkflowEngineInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `WorkflowEngineAccessPolicy`, `WorkflowEngineRatePolicy`,
  `WorkflowEngineProcessingPipeline`, `WorkflowEngineCachingDecorator`,
  `WorkflowEngineLoggingDecorator`, `WorkflowEngineMapper`,
  `WorkflowEngineEventObserver`, command/query/event handlers.
- **Events**: `WorkflowEngineExecuted`, `WorkflowEngineFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`IWorkflowEngine` implementations for tests and local development.

### Cross-cutting
`WorkflowEngineHealthCheck` (`health/`), `WorkflowEngineMetricsCollector`
(`statistics/`), `WorkflowEnginePrometheusMetricsCollector` (`metrics/`),
`WorkflowEngineError`/`WorkflowEngineErrorMapper` (`utils/`).

## Configuration
Builder (`WorkflowEngineConfigurationBuilder`), validator
(`WorkflowEngineConfigurationValidator`), and defaults/limits
(`WorkflowEngineDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
