# Testing: Analytics Layer

## Test files

Top-level (`__tests__/`):

- `Analytics.test.ts` — `execute()` happy path and error path
  (`ANALYTICS_EXECUTION_ERROR`), `configure()`, `getStatus()`.
- `AnalyticsStrategies.test.ts` — each strategy's `execute`,
  `canHandle`, `name`/`priority` invariants; factory creation by name
  and rejection of unknown names.
- `AnalyticsConfiguration.test.ts` — defaults, builder chaining,
  validator bounds.
- `AnalyticsEventProcessor.test.ts` — the event handler pipeline
  (`AnalyticsExecuted` / `AnalyticsFailed`).

Domain (`domain/__tests__/`):

- `AnalyticsDomain.test.ts` — entities, value objects, domain service.
- `AnalyticsExtendedDomain.test.ts` — specifications, policies,
  repository, pipeline.
- `AnalyticsServices.test.ts` — execution/query/validation services.
- `AnalyticsPatterns.test.ts` — mapper, decorators, observer.

## Running

From the repository root:

```bash
bun test ./src/layers/analytics/
```

or a single file:

```bash
bun test ./src/layers/analytics/__tests__/AnalyticsStrategies.test.ts
```

## Conventions

- No network or Redis: tests exercise the `InMemoryAdapter`, `MockAdapter`
  and `StubAdapter`.
- `HttpAnalyticsAdapter`/`RedisAnalyticsAdapter` are tested through their
  in-memory shims, not live endpoints.
- Each suite is self-contained: entities and value objects are built
  inside the test; there is no shared fixture file.
