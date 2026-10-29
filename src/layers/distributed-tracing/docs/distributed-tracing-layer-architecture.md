# DistributedTracing Layer Architecture

## Position
Layer 46. Responsibility: distributed tracing with OpenTelemetry-style span semantics.

## Core Contract
`IDistributedTracing` (`interfaces/`): `execute(context: DistributedTracingContext)`, `configure(config)`, `getStatus()` → `{ config, metrics, active }`.

`DistributedTracing` (`implementations/`) returns `DistributedTracingResult` (`{ success, data?, error? }`, code `DISTRIBUTEDTRACING_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Types (`types/distributed-tracing-types.ts`)
`DistributedTracingContext` `{ input, metadata, timestamp }` — trace/span data flows through `input`/`metadata`; `DistributedTracingResult<T>`; `DistributedTracingError`; `DistributedTracingConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
`IDistributedTracingStrategy` (`name`/`priority`/`canHandle`/`execute`) implementations via `DistributedTracingStrategyFactory`: `default` (0), `fast` (1), `reliable` (2), `batch` (3), `cached` (4). `batch` suits high-volume span export; `reliable` suits must-not-lose traces.

## Domain Model (`domain/`)
Entities (`DistributedTracingEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events (`DistributedTracingExecuted`/`Failed`), handlers, in-memory repository, mapper, caching/logging decorators, observer, pipeline, policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub (extension points for real OTLP/exporter adapters)
- `configuration/` — builders, `DEFAULT_DISTRIBUTEDTRACING_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`DistributedTracingError`, `DistributedTracingErrorMapper`)
