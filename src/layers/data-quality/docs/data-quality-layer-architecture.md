# DataQuality Layer Architecture

## Responsibility

Data quality validation. The layer takes a `DataQualityContext` (`input`, `metadata`,
`timestamp`) and returns `DataQualityResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/IDataQuality.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/DataQuality.ts` is the reference
implementation; it records success/failure counts and last execution
time, and wraps errors as `DATAQUALITY_EXECUTION_ERROR`.

## Strategies

`IDataQualityStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`DataQualityStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `DataQualityEntity`, `DataQualityExecution`, `DataQualityConfigState`,
  `DataQualityMetricsSnapshot`.
- **Value objects** — `DataQualityValueObject`, `DataQualityPriority`,
  `DataQualityThreshold`, `DataQualityTimeWindow`.
- **Services** — `DataQualityDomainService`, `DataQualityExecutionService`,
  `DataQualityQueryService`, `DataQualityValidationService`.
- **Handlers** — `DataQualityCommandHandler`, `DataQualityQueryHandler`,
  `DataQualityEventHandler`; lifecycle events `DataQualityExecuted`/`DataQualityFailed`.
- **Specifications** — `IDataQualitySpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `DataQualityAccessPolicy`, `DataQualityRatePolicy`.
- **Repository** — `DataQualityInMemoryRepository`;
  **pipeline** — `DataQualityProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `DataQualityMapper`; **observer** —
  `DataQualityEventObserver`.

## Adapters

`DataQualityInMemoryAdapter`, `DataQualityMockAdapter`, `DataQualityStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `DataQualityDefaults`, `DataQualityConfigurationBuilder`,
validators. `statistics/DataQualityMetricsCollector` (counts, timings, error
rates), `metrics/DataQualityPrometheusMetricsCollector` (Prometheus
exposition) and `health/DataQualityHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
