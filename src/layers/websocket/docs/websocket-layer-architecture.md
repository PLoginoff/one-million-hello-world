# Websocket Layer Architecture

## Position
Layer 42

## Responsibility
WebSocket connection and message framing. The layer exposes a uniform `execute(context)` contract:
callers submit work through the `Websocket` facade or a pluggable
strategy, and results come back as a `WebsocketResult<T>` envelope
(`success`, `data`, `error`).

## Components

### Contract and facade
- **`IWebsocket`** (`interfaces/`) — the layer contract.
- **`Websocket`** (`implementations/Websocket.ts`) — minimal facade:
  `execute()` echoes the input through the result envelope,
  `configure()` stores the config map, `getStatus()` reports
  initialization state and configured keys.

### Strategies (`strategies/`)
All strategies implement `IWebsocketStrategy`
(`name`, `priority`, `canHandle()`, `execute()`, `configure()`):

| Strategy | Priority | Behavior |
|----------|----------|----------|
| `WebsocketDefaultStrategy` | 0 | Balanced pass-through execution. |
| `WebsocketFastStrategy` | 10 | Lowest-latency path; highest selection priority. |
| `WebsocketReliableStrategy` | 5 | Reliability-oriented execution. |
| `WebsocketCachedStrategy` | 7 | Adds caching around execution. |
| `WebsocketBatchStrategy` | 3 | Batches executions. |

`WebsocketStrategyFactory` (`factories/`) creates strategies by name and
sorts them by priority.
`WebsocketStrategy` holds the shared strategy contract/base.

### Domain (`domain/`)
- **Entities**: `WebsocketEntity`, `WebsocketExecution`,
  `WebsocketConfigState`, `WebsocketMetricsSnapshot`.
- **Value objects**: `WebsocketValueObject`, `WebsocketThreshold`,
  `WebsocketPriority`, `WebsocketTimeWindow`.
- **Services**: `WebsocketDomainService`, `WebsocketExecutionService`,
  `WebsocketValidationService`, `WebsocketQueryService`.
- **Patterns**: `WebsocketInMemoryRepository`, specifications
  (`And`/`Or`/`Not`), `WebsocketAccessPolicy`, `WebsocketRatePolicy`,
  `WebsocketProcessingPipeline`, `WebsocketCachingDecorator`,
  `WebsocketLoggingDecorator`, `WebsocketMapper`,
  `WebsocketEventObserver`, command/query/event handlers.
- **Events**: `WebsocketExecuted`, `WebsocketFailed`.

### Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — interchangeable
`IWebsocket` implementations for tests and local development.

### Cross-cutting
`WebsocketHealthCheck` (`health/`), `WebsocketMetricsCollector`
(`statistics/`), `WebsocketPrometheusMetricsCollector` (`metrics/`),
`WebsocketError`/`WebsocketErrorMapper` (`utils/`).

## Configuration
Builder (`WebsocketConfigurationBuilder`), validator
(`WebsocketConfigurationValidator`), and defaults/limits
(`WebsocketDefaults.ts`) — see `configuration.md`.

## Testing
See `testing.md`. Unit tests cover the facade, strategies,
configuration, and the domain model (entities, patterns, services).
