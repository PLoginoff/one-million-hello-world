# Analytics Layer Architecture

## Responsibility

Analytics and event tracking. The layer receives a context object
(`AnalyticsContext`: `input`, `metadata`, `timestamp`), runs it through a
pluggable strategy, and returns an `AnalyticsResult<T>` (`success`, `data` or
`error`). It records success/failure counts and execution time in an
in-memory metrics map.

## Entry points

- `IAnalytics` (`interfaces/IAnalytics.ts`) — the contract:
  `execute(context)`, `configure(config)`, `getStatus()`.
- `Analytics` (`implementations/Analytics.ts`) — reference implementation.
  Wraps `_process()` in try/catch and emits
  `ANALYTICS_EXECUTION_ERROR` on failure.

## Strategies

Five strategies implement `IAnalyticsStrategy` (`strategies/`). Each has a
`name`, a `priority`, `canHandle(context)`, and `execute(context)`:

| Strategy | File | Priority | Intent |
|----------|------|----------|--------|
| `default`  | `DefaultStrategy.ts`  | 0  | Baseline processing |
| `fast`     | `FastStrategy.ts`     | 10 | Low-latency path, skips heavy work |
| `reliable` | `ReliableStrategy.ts` | 5  | Adds retry/confirmation semantics |
| `cached`   | `CachedStrategy.ts`   | 7  | Memoizes repeated inputs |
| `batch`    | `BatchStrategy.ts`    | 3  | Groups inputs into one execution |

`AnalyticsStrategyFactory` (`factories/AnalyticsStrategyFactory.ts`)
instantiates them by name and exposes `create`, `createDefault`,
`createAll`, `registerStrategy`, `getAvailableStrategies`.

## Domain model

`domain/` contains a self-contained DDD skeleton:

- **Entities** — `AnalyticsEntity`, `AnalyticsExecution`,
  `AnalyticsConfigState`, `AnalyticsMetricsSnapshot`.
- **Value objects** — `AnalyticsValueObject`, `AnalyticsPriority`,
  `AnalyticsThreshold`, `AnalyticsTimeWindow`.
- **Services** — `AnalyticsDomainService`, `AnalyticsExecutionService`,
  `AnalyticsQueryService`, `AnalyticsValidationService`.
- **Handlers** — command/query/event handlers plus
  `AnalyticsEventProcessor`.
- **Events** — `AnalyticsExecuted`, `AnalyticsFailed` (types in
  `AnalyticsEventTypes`).
- **Specifications** — `IAnalyticsSpecification` with `And`/`Or`/`Not`
  combinators for composable predicates.
- **Policies** — `AnalyticsAccessPolicy`, `AnalyticsRatePolicy`.
- **Repository** — `AnalyticsInMemoryRepository`.
- **Pipeline** — `AnalyticsProcessingPipeline`; **decorators** —
  caching and logging wrappers; **mapper** — `AnalyticsMapper`;
  **observer** — `AnalyticsEventObserver`.

## Event processing

`domain/handlers/AnalyticsEventProcessor.ts` is the substantive business
logic: it validates incoming events (`AnalyticsEventType`:
`page-view`, `event-tracked`, `user-identified`, `session-started`,
`session-ended`, `funnel-step`, `conversion`), enriches them with device,
geo and attribution data, tracks sessions (timeout via
`sessionTimeoutMs`), advances funnels and routes each enriched event to
every registered adapter. `AnalyticsProcessorConfig` toggles each stage
and lists `piiFields` to strip.

## Adapters

`adapters/` implement `IAnalyticsAdapter`
(`adapters/InMemoryAdapter.ts`):

- `AnalyticsInMemoryAdapter` — stores responses in a local map; used in
  tests and as the default sink.
- `AnalyticsMockAdapter` — canned responses.
- `AnalyticsStubAdapter` — no-op success responses.
- `HttpAnalyticsAdapter` / `RedisAnalyticsAdapter` — forward events to an
  HTTP endpoint or Redis for production pipelines.

## Configuration & observability

- `configuration/` — `AnalyticsDefaults`, builder
  (`AnalyticsConfigurationBuilder`, `AnalyticsBuilder`) and validators.
- `statistics/AnalyticsMetricsCollector` — counts, timings, error rates.
- `metrics/AnalyticsPrometheusMetricsCollector` — Prometheus exposition.
- `health/AnalyticsHealthCheck` — aggregates execution-count,
  success-rate and average-time checks into
  `healthy | degraded | unhealthy`.

## Testing

Unit tests under `__tests__/` and `domain/__tests__/` cover the
implementation, strategies, configuration and the domain services. See
`testing.md`.
