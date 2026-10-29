# DataLake Layer Architecture

## Responsibility

Data lake ingestion and storage. The layer takes a `DataLakeContext` (`input`, `metadata`,
`timestamp`) and returns `DataLakeResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/IDataLake.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/DataLake.ts` is the reference
implementation; it records success/failure counts and last execution
time, and wraps errors as `DATALAKE_EXECUTION_ERROR`.

## Strategies

`IDataLakeStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`DataLakeStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `DataLakeEntity`, `DataLakeExecution`, `DataLakeConfigState`,
  `DataLakeMetricsSnapshot`.
- **Value objects** — `DataLakeValueObject`, `DataLakePriority`,
  `DataLakeThreshold`, `DataLakeTimeWindow`.
- **Services** — `DataLakeDomainService`, `DataLakeExecutionService`,
  `DataLakeQueryService`, `DataLakeValidationService`.
- **Handlers** — `DataLakeCommandHandler`, `DataLakeQueryHandler`,
  `DataLakeEventHandler`; lifecycle events `DataLakeExecuted`/`DataLakeFailed`.
- **Specifications** — `IDataLakeSpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `DataLakeAccessPolicy`, `DataLakeRatePolicy`.
- **Repository** — `DataLakeInMemoryRepository`;
  **pipeline** — `DataLakeProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `DataLakeMapper`; **observer** —
  `DataLakeEventObserver`.

## Adapters

`DataLakeInMemoryAdapter`, `DataLakeMockAdapter`, `DataLakeStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `DataLakeDefaults`, `DataLakeConfigurationBuilder`,
validators. `statistics/DataLakeMetricsCollector` (counts, timings, error
rates), `metrics/DataLakePrometheusMetricsCollector` (Prometheus
exposition) and `health/DataLakeHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
