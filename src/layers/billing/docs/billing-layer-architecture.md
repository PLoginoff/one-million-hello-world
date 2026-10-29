# Billing Layer Architecture

## Responsibility

Usage metering, plan limits, and invoicing. The layer takes a `BillingContext` (`input`, `metadata`,
`timestamp`) and returns `BillingResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/IBilling.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/Billing.ts` is the reference
implementation. Its `execute` returns `{ success: true, data: { input,
metadata, layer: 'billing' } }`; `configure` marks the layer
initialized; `getStatus` exposes `layer`, `initialized` and
`configKeys`.

## Strategies

`IBillingStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`BillingStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `BillingEntity`, `BillingExecution`, `BillingConfigState`,
  `BillingMetricsSnapshot`.
- **Value objects** — `BillingValueObject`, `BillingPriority`,
  `BillingThreshold`, `BillingTimeWindow`.
- **Services** — `BillingDomainService`, `BillingExecutionService`,
  `BillingQueryService`, `BillingValidationService`.
- **Handlers** — `BillingCommandHandler`, `BillingQueryHandler`,
  `BillingEventHandler`; lifecycle events `BillingExecuted`/`BillingFailed`.
- **Specifications** — `IBillingSpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `BillingAccessPolicy`, `BillingRatePolicy`.
- **Repository** — `BillingInMemoryRepository`;
  **pipeline** — `BillingProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `BillingMapper`; **observer** —
  `BillingEventObserver`.

## Adapters

`BillingInMemoryAdapter`, `BillingMockAdapter`, `BillingStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `BillingDefaults`, `BillingConfigurationBuilder`,
validators. `statistics/BillingMetricsCollector` (counts, timings, error
rates), `metrics/BillingPrometheusMetricsCollector` (Prometheus
exposition) and `health/BillingHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
