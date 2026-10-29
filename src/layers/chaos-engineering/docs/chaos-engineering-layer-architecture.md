# ChaosEngineering Layer Architecture

## Responsibility

Chaos engineering and fault injection. The layer takes a `ChaosEngineeringContext` (`input`, `metadata`,
`timestamp`) and returns `ChaosEngineeringResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/IChaosEngineering.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/ChaosEngineering.ts` is the reference
implementation; it records success/failure counts and last execution
time, and wraps errors as `CHAOSENGINEERING_EXECUTION_ERROR`.

## Strategies

`IChaosEngineeringStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`ChaosEngineeringStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `ChaosEngineeringEntity`, `ChaosEngineeringExecution`, `ChaosEngineeringConfigState`,
  `ChaosEngineeringMetricsSnapshot`.
- **Value objects** — `ChaosEngineeringValueObject`, `ChaosEngineeringPriority`,
  `ChaosEngineeringThreshold`, `ChaosEngineeringTimeWindow`.
- **Services** — `ChaosEngineeringDomainService`, `ChaosEngineeringExecutionService`,
  `ChaosEngineeringQueryService`, `ChaosEngineeringValidationService`.
- **Handlers** — `ChaosEngineeringCommandHandler`, `ChaosEngineeringQueryHandler`,
  `ChaosEngineeringEventHandler`; lifecycle events `ChaosEngineeringExecuted`/`ChaosEngineeringFailed`.
- **Specifications** — `IChaosEngineeringSpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `ChaosEngineeringAccessPolicy`, `ChaosEngineeringRatePolicy`.
- **Repository** — `ChaosEngineeringInMemoryRepository`;
  **pipeline** — `ChaosEngineeringProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `ChaosEngineeringMapper`; **observer** —
  `ChaosEngineeringEventObserver`.

## Adapters

`ChaosEngineeringInMemoryAdapter`, `ChaosEngineeringMockAdapter`, `ChaosEngineeringStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `ChaosEngineeringDefaults`, `ChaosEngineeringConfigurationBuilder`,
validators. `statistics/ChaosEngineeringMetricsCollector` (counts, timings, error
rates), `metrics/ChaosEngineeringPrometheusMetricsCollector` (Prometheus
exposition) and `health/ChaosEngineeringHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
