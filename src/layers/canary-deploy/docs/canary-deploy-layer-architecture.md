# CanaryDeploy Layer Architecture

## Responsibility

Canary deployment and rollout gating. The layer takes a `CanaryDeployContext` (`input`, `metadata`,
`timestamp`) and returns `CanaryDeployResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/ICanaryDeploy.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/CanaryDeploy.ts` is the reference
implementation; it records success/failure counts and last execution
time, and wraps errors as `CANARYDEPLOY_EXECUTION_ERROR`.

## Strategies

`ICanaryDeployStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`CanaryDeployStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `CanaryDeployEntity`, `CanaryDeployExecution`, `CanaryDeployConfigState`,
  `CanaryDeployMetricsSnapshot`.
- **Value objects** — `CanaryDeployValueObject`, `CanaryDeployPriority`,
  `CanaryDeployThreshold`, `CanaryDeployTimeWindow`.
- **Services** — `CanaryDeployDomainService`, `CanaryDeployExecutionService`,
  `CanaryDeployQueryService`, `CanaryDeployValidationService`.
- **Handlers** — `CanaryDeployCommandHandler`, `CanaryDeployQueryHandler`,
  `CanaryDeployEventHandler`; lifecycle events `CanaryDeployExecuted`/`CanaryDeployFailed`.
- **Specifications** — `ICanaryDeploySpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `CanaryDeployAccessPolicy`, `CanaryDeployRatePolicy`.
- **Repository** — `CanaryDeployInMemoryRepository`;
  **pipeline** — `CanaryDeployProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `CanaryDeployMapper`; **observer** —
  `CanaryDeployEventObserver`.

## Adapters

`CanaryDeployInMemoryAdapter`, `CanaryDeployMockAdapter`, `CanaryDeployStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `CanaryDeployDefaults`, `CanaryDeployConfigurationBuilder`,
validators. `statistics/CanaryDeployMetricsCollector` (counts, timings, error
rates), `metrics/CanaryDeployPrometheusMetricsCollector` (Prometheus
exposition) and `health/CanaryDeployHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
