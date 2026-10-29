# CostOptimization Layer Architecture

## Responsibility

FinOps resource optimization and cost tracking. The layer takes a `CostOptimizationContext` (`input`, `metadata`,
`timestamp`) and returns `CostOptimizationResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/ICostOptimization.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/CostOptimization.ts` is the reference
implementation. Its `execute` returns `{ success: true, data: { input,
metadata, layer: 'cost-optimization' } }`; `configure` marks the layer
initialized; `getStatus` exposes `layer`, `initialized` and
`configKeys`.

## Strategies

`ICostOptimizationStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`CostOptimizationStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `CostOptimizationEntity`, `CostOptimizationExecution`, `CostOptimizationConfigState`,
  `CostOptimizationMetricsSnapshot`.
- **Value objects** — `CostOptimizationValueObject`, `CostOptimizationPriority`,
  `CostOptimizationThreshold`, `CostOptimizationTimeWindow`.
- **Services** — `CostOptimizationDomainService`, `CostOptimizationExecutionService`,
  `CostOptimizationQueryService`, `CostOptimizationValidationService`.
- **Handlers** — `CostOptimizationCommandHandler`, `CostOptimizationQueryHandler`,
  `CostOptimizationEventHandler`; lifecycle events `CostOptimizationExecuted`/`CostOptimizationFailed`.
- **Specifications** — `ICostOptimizationSpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `CostOptimizationAccessPolicy`, `CostOptimizationRatePolicy`.
- **Repository** — `CostOptimizationInMemoryRepository`;
  **pipeline** — `CostOptimizationProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `CostOptimizationMapper`; **observer** —
  `CostOptimizationEventObserver`.

## Adapters

`CostOptimizationInMemoryAdapter`, `CostOptimizationMockAdapter`, `CostOptimizationStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `CostOptimizationDefaults`, `CostOptimizationConfigurationBuilder`,
validators. `statistics/CostOptimizationMetricsCollector` (counts, timings, error
rates), `metrics/CostOptimizationPrometheusMetricsCollector` (Prometheus
exposition) and `health/CostOptimizationHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
