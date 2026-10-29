# API Versioning Layer Architecture

## Responsibility

API version negotiation and deprecation management. Infra Layer 1.
The layer takes an `ApiVersioningContext` (`input`, `metadata`,
`timestamp`) and returns `ApiVersioningResult<T>`.

## Public contract

`interfaces/IApiVersioning.ts` — `execute`, `configure`, `getStatus`.
`implementations/ApiVersioning.ts` is the reference implementation:
`execute` returns `{ success: true, data: { input, metadata, layer:
'api-versioning' } }`; `configure` marks it initialized; `getStatus`
exposes `layer`, `initialized`, `configKeys`.

## Strategies

`IApiVersioningStrategy` (`strategies/`): `name`, `priority`,
`canHandle`, `execute`. Five implementations — `default` (0),
`fast` (10), `reliable` (5), `cached` (7), `batch` (3) — created by
`ApiVersioningStrategyFactory`.

## Domain model

`domain/` — entities (`ApiVersioningEntity`, `ApiVersioningExecution`,
`ApiVersioningConfigState`, `ApiVersioningMetricsSnapshot`), value
objects (`ApiVersioningValueObject`, `ApiVersioningPriority`,
`ApiVersioningThreshold`, `ApiVersioningTimeWindow`), services
(`Domain`, `Execution`, `Query`, `Validation`), command/query/event
handlers (`ApiVersioningExecuted`/`ApiVersioningFailed` events),
specifications (`And`/`Or`/`Not`), policies (`Access`, `Rate`),
`ApiVersioningInMemoryRepository`, `ApiVersioningProcessingPipeline`,
caching/logging decorators, `ApiVersioningMapper`,
`ApiVersioningEventObserver`.

## Adapters

`ApiVersioningInMemoryAdapter`, `ApiVersioningMockAdapter`,
`ApiVersioningStubAdapter` — for tests and local wiring; no HTTP/Redis
adapter is shipped in this layer.

## Configuration & observability

`configuration/` — `ApiVersioningDEFAULTS` (extended set: `strategy`,
`maxConcurrentExecutions`, `cacheEnabled`, `cacheTtlMs`,
`metricsEnabled`, `healthCheckEnabled`, `healthCheckIntervalMs`),
`ApiVersioningLIMITS`, `ApiVersioningSTRATEGIES`, fluent builder and
validators. `ApiVersioningMetricsCollector`,
`ApiVersioningPrometheusMetricsCollector`, `ApiVersioningHealthCheck`.
