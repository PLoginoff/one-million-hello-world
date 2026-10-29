# EventSourcing Layer Architecture

## Position
Layer 51. Responsibility: event sourcing and event store — append/replay operations behind a uniform contract.

## Core Contract
`IEventSourcing` (`interfaces/`): `execute(context: EventSourcingContext)`, `configure(config)`, `getStatus()` → `{ config, metrics, active }`.

`EventSourcing` (`implementations/`) returns `EventSourcingResult` (`{ success, data?, error? }`, code `EVENTSOURCING_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Types (`types/event-sourcing-types.ts`)
`EventSourcingContext` `{ input, metadata, timestamp }` — append/replay operations flow through `input`; `EventSourcingResult<T>`; `EventSourcingError`; `EventSourcingConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
`IEventSourcingStrategy` (`name`/`priority`/`canHandle`/`execute`) implementations via `EventSourcingStrategyFactory`: `default` (0), `fast` (1), `reliable` (2), `batch` (3), `cached` (4). `batch` suits bulk event append; `reliable` suits must-durably-store events; `cached` memoizes replayed state.

## Domain Model (`domain/`)
Entities (`EventSourcingEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events (`EventSourcingExecuted`/`Failed`), handlers, in-memory repository (the event store seam), mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
- `errors/EventSourcingErrors.ts` — typed error codes for store failures (concurrency conflicts, missing streams)
- `adapters/` — InMemory, Mock, Stub (extension points for real event stores: EventStoreDB, Kafka-backed)
- `configuration/` — builders, `DEFAULT_EVENTSOURCING_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`EventSourcingError`, `EventSourcingErrorMapper`)
