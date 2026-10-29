# ADR: DataLake Layer

## Status

Accepted

## ADR-1: Strategy pattern for execution variants

**Context.** Callers trade latency vs reliability vs throughput for the
same data lake ingestion and storage operation.

**Decision.** Five `IDataLakeStrategy` implementations —
`default`, `fast`, `reliable`, `cached`, `batch` — each with `priority`
and `canHandle`, created by `DataLakeStrategyFactory` by name.

**Consequences.** Execution profile is a config value; new strategies
are additive without touching `DataLake` or the interface.

## ADR-2: Self-contained DDD skeleton inside the layer

**Context.** The layer should be testable in isolation and able to grow
a richer data lake ingestion and storage model without a redesign.

**Decision.** Keep entities, value objects, domain services,
specifications, policies, an in-memory repository, a processing
pipeline, decorators, a mapper and command/query/event handlers under
`domain/`, with `DataLakeExecuted`/`DataLakeFailed` lifecycle events.

**Consequences.** Domain logic is unit-testable without strategies or
adapters. Cost: ~40 files of scaffolding; the structure is ready for
real data lake ingestion and storage logic.

## ADR-3: In-memory adapters only

**Context.** The layer's outputs stay in-process for now; there is no
hard requirement for a remote sink.

**Decision.** Ship `DataLakeInMemoryAdapter`, `DataLakeMockAdapter` and
`DataLakeStubAdapter` implementing the same contract as `DataLake`.

**Consequences.** Every test runs offline with deterministic behaviour.
A remote adapter (HTTP, Redis, broker) can be added later without
changing call sites.

## ADR-4: Minimal common config

**Context.** The layer only needs the cross-cutting operational knobs.

**Decision.** `DEFAULT_DATALAKE_CONFIG` carries
`enabled`, `timeout`, `retries`, `logLevel`.

**Consequences.** Configuration stays small; layer-specific options go
through `configure(config)` as free-form keys.
