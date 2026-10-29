# Bpmn Layer Architecture

## Responsibility

BPMN process execution. The layer takes a `BpmnContext` (`input`, `metadata`,
`timestamp`) and returns `BpmnResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/IBpmn.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/Bpmn.ts` is the reference
implementation; it records success/failure counts and last execution
time, and wraps errors as `BPMN_EXECUTION_ERROR`.

## Strategies

`IBpmnStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`BpmnStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `BpmnEntity`, `BpmnExecution`, `BpmnConfigState`,
  `BpmnMetricsSnapshot`.
- **Value objects** — `BpmnValueObject`, `BpmnPriority`,
  `BpmnThreshold`, `BpmnTimeWindow`.
- **Services** — `BpmnDomainService`, `BpmnExecutionService`,
  `BpmnQueryService`, `BpmnValidationService`.
- **Handlers** — `BpmnCommandHandler`, `BpmnQueryHandler`,
  `BpmnEventHandler`; lifecycle events `BpmnExecuted`/`BpmnFailed`.
- **Specifications** — `IBpmnSpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `BpmnAccessPolicy`, `BpmnRatePolicy`.
- **Repository** — `BpmnInMemoryRepository`;
  **pipeline** — `BpmnProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `BpmnMapper`; **observer** —
  `BpmnEventObserver`.

## Adapters

`BpmnInMemoryAdapter`, `BpmnMockAdapter`, `BpmnStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `BpmnDefaults`, `BpmnConfigurationBuilder`,
validators. `statistics/BpmnMetricsCollector` (counts, timings, error
rates), `metrics/BpmnPrometheusMetricsCollector` (Prometheus
exposition) and `health/BpmnHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
