# ADR: CdnIntegration Layer

## Status

Accepted

## ADR-1: Strategy pattern for execution variants

**Context.** Callers trade latency vs reliability vs throughput for the
same cdn purge, invalidation, and cache management operation.

**Decision.** Five `ICdnIntegrationStrategy` implementations —
`default`, `fast`, `reliable`, `cached`, `batch` — each with `priority`
and `canHandle`, created by `CdnIntegrationStrategyFactory` by name.

**Consequences.** Execution profile is a config value; new strategies
are additive without touching `CdnIntegration` or the interface.

## ADR-2: Self-contained DDD skeleton inside the layer

**Context.** The layer should be testable in isolation and able to grow
a richer cdn purge, invalidation, and cache management model without a redesign.

**Decision.** Keep entities, value objects, domain services,
specifications, policies, an in-memory repository, a processing
pipeline, decorators, a mapper and command/query/event handlers under
`domain/`, with `CdnIntegrationExecuted`/`CdnIntegrationFailed` lifecycle events.

**Consequences.** Domain logic is unit-testable without strategies or
adapters. Cost: ~40 files of scaffolding; the structure is ready for
real cdn purge, invalidation, and cache management logic.

## ADR-3: In-memory adapters only

**Context.** The layer's outputs stay in-process for now; there is no
hard requirement for a remote sink.

**Decision.** Ship `CdnIntegrationInMemoryAdapter`, `CdnIntegrationMockAdapter` and
`CdnIntegrationStubAdapter` implementing the same contract as `CdnIntegration`.

**Consequences.** Every test runs offline with deterministic behaviour.
A remote adapter (HTTP, Redis, broker) can be added later without
changing call sites.

## ADR-4: Extended runtime config

**Context.** The layer needs operational tuning beyond on/off:
concurrency, caching, metrics and health cadence.

**Decision.** `CdnIntegrationDEFAULTS` adds `strategy`,
`maxConcurrentExecutions`, `cacheEnabled`/`cacheTtlMs`, `metricsEnabled`
and `healthCheckEnabled`/`healthCheckIntervalMs` on top of the common
`enabled`/`timeout`/`retries`/`logLevel`; bounds live in
`CdnIntegrationLIMITS`.

**Consequences.** One config object drives behaviour, metrics and
health; the validator rejects out-of-range values.
