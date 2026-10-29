# Cqrs Layer Architecture

## Responsibility

Command Query Responsibility Segregation. The layer takes a `CqrsContext` (`input`, `metadata`,
`timestamp`) and returns `CqrsResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/ICqrs.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/Cqrs.ts` is the reference
implementation; it records success/failure counts and last execution
time, and wraps errors as `CQRS_EXECUTION_ERROR`.

## Strategies

`ICqrsStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`CqrsStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `CqrsEntity`, `CqrsExecution`, `CqrsConfigState`,
  `CqrsMetricsSnapshot`.
- **Value objects** — `CqrsValueObject`, `CqrsPriority`,
  `CqrsThreshold`, `CqrsTimeWindow`.
- **Services** — `CqrsDomainService`, `CqrsExecutionService`,
  `CqrsQueryService`, `CqrsValidationService`.
- **Handlers** — `CqrsCommandHandler`, `CqrsQueryHandler`,
  `CqrsEventHandler`; lifecycle events `CqrsExecuted`/`CqrsFailed`.
- **Specifications** — `ICqrsSpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `CqrsAccessPolicy`, `CqrsRatePolicy`.
- **Repository** — `CqrsInMemoryRepository`;
  **pipeline** — `CqrsProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `CqrsMapper`; **observer** —
  `CqrsEventObserver`.

## Adapters

`CqrsInMemoryAdapter`, `CqrsMockAdapter`, `CqrsStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `CqrsDefaults`, `CqrsConfigurationBuilder`,
validators. `statistics/CqrsMetricsCollector` (counts, timings, error
rates), `metrics/CqrsPrometheusMetricsCollector` (Prometheus
exposition) and `health/CqrsHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
