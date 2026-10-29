# DataLineage Layer Architecture

## Responsibility

Data flow tracking and lineage graph. The layer takes a `DataLineageContext` (`input`, `metadata`,
`timestamp`) and returns `DataLineageResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/IDataLineage.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/DataLineage.ts` is the reference
implementation. Its `execute` returns `{ success: true, data: { input,
metadata, layer: 'data-lineage' } }`; `configure` marks the layer
initialized; `getStatus` exposes `layer`, `initialized` and
`configKeys`.

## Strategies

`IDataLineageStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`DataLineageStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `DataLineageEntity`, `DataLineageExecution`, `DataLineageConfigState`,
  `DataLineageMetricsSnapshot`.
- **Value objects** — `DataLineageValueObject`, `DataLineagePriority`,
  `DataLineageThreshold`, `DataLineageTimeWindow`.
- **Services** — `DataLineageDomainService`, `DataLineageExecutionService`,
  `DataLineageQueryService`, `DataLineageValidationService`.
- **Handlers** — `DataLineageCommandHandler`, `DataLineageQueryHandler`,
  `DataLineageEventHandler`; lifecycle events `DataLineageExecuted`/`DataLineageFailed`.
- **Specifications** — `IDataLineageSpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `DataLineageAccessPolicy`, `DataLineageRatePolicy`.
- **Repository** — `DataLineageInMemoryRepository`;
  **pipeline** — `DataLineageProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `DataLineageMapper`; **observer** —
  `DataLineageEventObserver`.

## Adapters

`DataLineageInMemoryAdapter`, `DataLineageMockAdapter`, `DataLineageStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `DataLineageDefaults`, `DataLineageConfigurationBuilder`,
validators. `statistics/DataLineageMetricsCollector` (counts, timings, error
rates), `metrics/DataLineagePrometheusMetricsCollector` (Prometheus
exposition) and `health/DataLineageHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
