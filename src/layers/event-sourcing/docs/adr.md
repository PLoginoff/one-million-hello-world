# ADR: EventSourcing Layer

## Status
Accepted

## Decisions

### 1. Uniform `execute(context)` contract
Append/replay operations flow through `execute(EventSourcingContext)` so the event store composes with the write-model and snapshot layers using the same `Context → Result` shape.

### 2. Dedicated `errors/` module
`EventSourcingErrors.ts` centralizes typed codes for store-specific failures (optimistic-concurrency conflicts, missing streams, version mismatches) — these must be distinguishable, not collapsed into generic errors.

### 3. Batch append as a named strategy
Event sourcing workloads are append-heavy — `batch` is a first-class strategy rather than a flag, for high-throughput event ingestion.

### 4. Cached strategy for replay
Replaying long event streams to rebuild state is expensive — `cached` memoizes replayed state for repeated aggregate loads.

### 5. In-memory store as the default repository
The domain repository is in-memory; durable event stores plug in at the adapter seam without changing the domain model — the same repository interface serves tests and production.

### 6. Non-throwing results
`execute()` returns `{ success: false, error: { code: 'EVENTSOURCING_EXECUTION_ERROR' } }` — append conflicts are expected control flow in event sourcing, not exceptional.
