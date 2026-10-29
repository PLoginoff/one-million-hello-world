# ADR: API Versioning Layer

## Status

Accepted

## ADR-1: Strategy pattern for negotiation variants

**Context.** Version negotiation can favour latency, reliability,
caching or batching depending on the caller.

**Decision.** Five `IApiVersioningStrategy` implementations
(`default`/`fast`/`reliable`/`cached`/`batch`) with `priority` and
`canHandle`, created by `ApiVersioningStrategyFactory`.

**Consequences.** The execution profile is a config value; new
strategies are additive without changing `IApiVersioning`.

## ADR-2: Self-contained DDD skeleton

**Context.** The layer should be testable in isolation and able to grow
a richer model (deprecation windows, version matrices).

**Decision.** Keep entities (`ApiVersioningEntity`,
`ApiVersioningExecution`, `ApiVersioningConfigState`,
`ApiVersioningMetricsSnapshot`), value objects, services,
specifications, policies, an in-memory repository, pipeline and
decorators under `domain/`, with `ApiVersioningExecuted`/`Failed`
lifecycle events.

**Consequences.** Domain logic is unit-testable without strategies or
adapters. Cost: ~40 files of scaffolding.

## ADR-3: Only in-memory adapters shipped

**Context.** Version negotiation is a CPU/local operation; there is no
natural remote sink.

**Decision.** Ship `InMemory`/`Mock`/`Stub` adapters only.

**Consequences.** All tests run offline. If a remote registry is needed
later it becomes a new adapter implementing the same contract.

## ADR-4: Extended config with strategy and cache knobs

**Context.** The infra layers need runtime tuning beyond on/off.

**Decision.** `ApiVersioningDEFAULTS` adds `strategy`,
`maxConcurrentExecutions`, `cacheEnabled`/`cacheTtlMs`,
`metricsEnabled`, `healthCheckEnabled`/`healthCheckIntervalMs`, bounded
by `ApiVersioningLIMITS`.

**Consequences.** One config object drives behaviour, metrics and health;
the validator rejects out-of-range values.
