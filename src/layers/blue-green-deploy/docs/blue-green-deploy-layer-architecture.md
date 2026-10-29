# BlueGreenDeploy Layer Architecture

## Responsibility

Blue-green deployment strategy. The layer takes a `BlueGreenDeployContext` (`input`, `metadata`,
`timestamp`) and returns `BlueGreenDeployResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/IBlueGreenDeploy.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/BlueGreenDeploy.ts` is the reference
implementation; it records success/failure counts and last execution
time, and wraps errors as `BLUEGREENDEPLOY_EXECUTION_ERROR`.

## Strategies

`IBlueGreenDeployStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`BlueGreenDeployStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `BlueGreenDeployEntity`, `BlueGreenDeployExecution`, `BlueGreenDeployConfigState`,
  `BlueGreenDeployMetricsSnapshot`.
- **Value objects** — `BlueGreenDeployValueObject`, `BlueGreenDeployPriority`,
  `BlueGreenDeployThreshold`, `BlueGreenDeployTimeWindow`.
- **Services** — `BlueGreenDeployDomainService`, `BlueGreenDeployExecutionService`,
  `BlueGreenDeployQueryService`, `BlueGreenDeployValidationService`.
- **Handlers** — `BlueGreenDeployCommandHandler`, `BlueGreenDeployQueryHandler`,
  `BlueGreenDeployEventHandler`; lifecycle events `BlueGreenDeployExecuted`/`BlueGreenDeployFailed`.
- **Specifications** — `IBlueGreenDeploySpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `BlueGreenDeployAccessPolicy`, `BlueGreenDeployRatePolicy`.
- **Repository** — `BlueGreenDeployInMemoryRepository`;
  **pipeline** — `BlueGreenDeployProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `BlueGreenDeployMapper`; **observer** —
  `BlueGreenDeployEventObserver`.

## Adapters

`BlueGreenDeployInMemoryAdapter`, `BlueGreenDeployMockAdapter`, `BlueGreenDeployStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `BlueGreenDeployDefaults`, `BlueGreenDeployConfigurationBuilder`,
validators. `statistics/BlueGreenDeployMetricsCollector` (counts, timings, error
rates), `metrics/BlueGreenDeployPrometheusMetricsCollector` (Prometheus
exposition) and `health/BlueGreenDeployHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
