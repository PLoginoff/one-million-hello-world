# ContractTesting Layer Architecture

## Responsibility

Contract testing. The layer takes a `ContractTestingContext` (`input`, `metadata`,
`timestamp`) and returns `ContractTestingResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/IContractTesting.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/ContractTesting.ts` is the reference
implementation; it records success/failure counts and last execution
time, and wraps errors as `CONTRACTTESTING_EXECUTION_ERROR`.

## Strategies

`IContractTestingStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`ContractTestingStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `ContractTestingEntity`, `ContractTestingExecution`, `ContractTestingConfigState`,
  `ContractTestingMetricsSnapshot`.
- **Value objects** — `ContractTestingValueObject`, `ContractTestingPriority`,
  `ContractTestingThreshold`, `ContractTestingTimeWindow`.
- **Services** — `ContractTestingDomainService`, `ContractTestingExecutionService`,
  `ContractTestingQueryService`, `ContractTestingValidationService`.
- **Handlers** — `ContractTestingCommandHandler`, `ContractTestingQueryHandler`,
  `ContractTestingEventHandler`; lifecycle events `ContractTestingExecuted`/`ContractTestingFailed`.
- **Specifications** — `IContractTestingSpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `ContractTestingAccessPolicy`, `ContractTestingRatePolicy`.
- **Repository** — `ContractTestingInMemoryRepository`;
  **pipeline** — `ContractTestingProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `ContractTestingMapper`; **observer** —
  `ContractTestingEventObserver`.

## Adapters

`ContractTestingInMemoryAdapter`, `ContractTestingMockAdapter`, `ContractTestingStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `ContractTestingDefaults`, `ContractTestingConfigurationBuilder`,
validators. `statistics/ContractTestingMetricsCollector` (counts, timings, error
rates), `metrics/ContractTestingPrometheusMetricsCollector` (Prometheus
exposition) and `health/ContractTestingHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
