# ADR: DataLineage Layer

## Status

Accepted

## ADR-1: Strategy pattern for execution variants

**Context.** Callers trade latency vs reliability vs throughput for the
same data flow tracking and lineage graph operation.

**Decision.** Five `IDataLineageStrategy` implementations —
`default`, `fast`, `reliable`, `cached`, `batch` — each with `priority`
and `canHandle`, created by `DataLineageStrategyFactory` by name.

**Consequences.** Execution profile is a config value; new strategies
are additive without touching `DataLineage` or the interface.

## ADR-2: Self-contained DDD skeleton inside the layer

**Context.** The layer should be testable in isolation and able to grow
a richer data flow tracking and lineage graph model without a redesign.

**Decision.** Keep entities, value objects, domain services,
specifications, policies, an in-memory repository, a processing
pipeline, decorators, a mapper and command/query/event handlers under
`domain/`, with `DataLineageExecuted`/`DataLineageFailed` lifecycle events.

**Consequences.** Domain logic is unit-testable without strategies or
adapters. Cost: ~40 files of scaffolding; the structure is ready for
real data flow tracking and lineage graph logic.

## ADR-3: In-memory adapters only

**Context.** The layer's outputs stay in-process for now; there is no
hard requirement for a remote sink.

**Decision.** Ship `DataLineageInMemoryAdapter`, `DataLineageMockAdapter` and
`DataLineageStubAdapter` implementing the same contract as `DataLineage`.

**Consequences.** Every test runs offline with deterministic behaviour.
A remote adapter (HTTP, Redis, broker) can be added later without
changing call sites.

## ADR-4: Extended runtime config

**Context.** The layer needs operational tuning beyond on/off:
concurrency, caching, metrics and health cadence.

**Decision.** `DataLineageDEFAULTS` adds `strategy`,
`maxConcurrentExecutions`, `cacheEnabled`/`cacheTtlMs`, `metricsEnabled`
and `healthCheckEnabled`/`healthCheckIntervalMs` on top of the common
`enabled`/`timeout`/`retries`/`logLevel`; bounds live in
`DataLineageLIMITS`.

**Consequences.** One config object drives behaviour, metrics and
health; the validator rejects out-of-range values.
