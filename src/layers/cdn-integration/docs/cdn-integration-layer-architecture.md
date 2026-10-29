# CdnIntegration Layer Architecture

## Responsibility

CDN purge, invalidation, and cache management. The layer takes a `CdnIntegrationContext` (`input`, `metadata`,
`timestamp`) and returns `CdnIntegrationResult<T>` (`success`, `data` or
`error`).

## Public contract

`interfaces/ICdnIntegration.ts` — `execute(context)`, `configure(config)`,
`getStatus()`. `implementations/CdnIntegration.ts` is the reference
implementation. Its `execute` returns `{ success: true, data: { input,
metadata, layer: 'cdn-integration' } }`; `configure` marks the layer
initialized; `getStatus` exposes `layer`, `initialized` and
`configKeys`.

## Strategies

`ICdnIntegrationStrategy` (`strategies/`): `name`, `priority`, `canHandle`,
`execute`. Five implementations — `default` (0), `fast` (10),
`reliable` (5), `cached` (7), `batch` (3) — created by name via
`CdnIntegrationStrategyFactory` (`create`, `createDefault`, `createAll`,
`registerStrategy`, `getAvailableStrategies`).

## Domain model

`domain/` is a self-contained DDD skeleton:

- **Entities** — `CdnIntegrationEntity`, `CdnIntegrationExecution`, `CdnIntegrationConfigState`,
  `CdnIntegrationMetricsSnapshot`.
- **Value objects** — `CdnIntegrationValueObject`, `CdnIntegrationPriority`,
  `CdnIntegrationThreshold`, `CdnIntegrationTimeWindow`.
- **Services** — `CdnIntegrationDomainService`, `CdnIntegrationExecutionService`,
  `CdnIntegrationQueryService`, `CdnIntegrationValidationService`.
- **Handlers** — `CdnIntegrationCommandHandler`, `CdnIntegrationQueryHandler`,
  `CdnIntegrationEventHandler`; lifecycle events `CdnIntegrationExecuted`/`CdnIntegrationFailed`.
- **Specifications** — `ICdnIntegrationSpecification` with `And`/`Or`/`Not`
  combinators.
- **Policies** — `CdnIntegrationAccessPolicy`, `CdnIntegrationRatePolicy`.
- **Repository** — `CdnIntegrationInMemoryRepository`;
  **pipeline** — `CdnIntegrationProcessingPipeline`; **decorators** —
  caching/logging; **mapper** — `CdnIntegrationMapper`; **observer** —
  `CdnIntegrationEventObserver`.

## Adapters

`CdnIntegrationInMemoryAdapter`, `CdnIntegrationMockAdapter`, `CdnIntegrationStubAdapter`
(`adapters/`) — the in-memory variant stores responses in a local map;
mock/stub return canned/no-op responses. No remote adapter ships in this
layer; add one by implementing the same contract.

## Configuration & observability

`configuration/` — `CdnIntegrationDefaults`, `CdnIntegrationConfigurationBuilder`,
validators. `statistics/CdnIntegrationMetricsCollector` (counts, timings, error
rates), `metrics/CdnIntegrationPrometheusMetricsCollector` (Prometheus
exposition) and `health/CdnIntegrationHealthCheck` aggregating execution-count,
success-rate and average-time checks into `healthy | degraded |
unhealthy`.
