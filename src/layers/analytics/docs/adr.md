# ADR: Analytics Layer

## Status

Accepted

## ADR-1: Strategy pattern for execution variants

**Context.** Analytics workloads differ: some calls must be fast, some
must be reliable, some benefit from caching or batching. A single
`execute()` cannot express these trade-offs.

**Decision.** Model execution as `IAnalyticsStrategy` with five
implementations (`default`, `fast`, `reliable`, `cached`, `batch`), each
with a `priority` and `canHandle()`. A `AnalyticsStrategyFactory` creates
them by name.

**Consequences.** New strategies are added without touching the
implementation class; the caller picks a strategy by name or lets
`canHandle` choose. Cost: five extra classes plus a factory.

## ADR-2: Self-contained DDD skeleton inside the layer

**Context.** The layer needs to be testable in isolation and to evolve
toward a richer domain model without a redesign.

**Decision.** Keep entities, value objects, domain services,
specifications, policies, an in-memory repository, a processing pipeline,
decorators, a mapper and event handlers under `domain/`. Events
(`AnalyticsExecuted`/`AnalyticsFailed`) model the execution lifecycle.

**Consequences.** Domain logic is unit-testable without the strategy or
adapter machinery. Cost: ~40 domain files for a layer whose current
business logic is thin; the structure is scaffolding for growth.

## ADR-3: Multiple adapter implementations of the same interface

**Context.** Analytics data may stay in-process (tests) or be shipped to
an HTTP collector or Redis.

**Decision.** Implement `IAnalytics` in `InMemoryAdapter`, `MockAdapter`,
`StubAdapter`, `HttpAnalyticsAdapter` and `RedisAnalyticsAdapter`.

**Consequences.** Tests run without network or Redis; production code
swaps in the HTTP/Redis adapter by configuration. Cost: each adapter must
keep parity with the interface.

## ADR-4: Metrics and health as first-class citizens

**Context.** The layer must expose operational signal: counts, timings,
error rates, health status.

**Decision.** `AnalyticsMetricsCollector` (statistics),
`AnalyticsPrometheusMetricsCollector` (metrics export) and
`AnalyticsHealthCheck` (healthy/degraded/unhealthy aggregation) are
separate modules, not bolted onto the implementation.

**Consequences.** Observability is testable and replaceable; the
implementation stays free of metrics plumbing except for two counter
updates in `execute()`.
