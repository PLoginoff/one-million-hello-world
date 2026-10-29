# ADR: QueryObject Layer

## Status
Accepted

## Context
The pipeline requires a dedicated query-object step (query object and specification queries) that can be
tuned per deployment without changing call sites.

## Decisions

### 1. Strategy pattern over a single implementation
Five strategies (`default`, `fast`, `reliable`, `cached`,
`batch`) implement `IQueryObjectStrategy`. Callers pick by name via
`QueryObjectStrategyFactory`; new strategies register via
`registerStrategy` without touching the factory.

### 2. CQRS-style domain handlers
`QueryObjectCommandHandler`, `QueryObjectQueryHandler` and
`QueryObjectEventHandler` separate write, read and notification concerns;
`QueryObjectEventObserver` subscribers react to `QueryObjectExecuted` /
`QueryObjectFailed`.

### 3. In-memory adapter first
`InMemoryAdapter` is the primary adapter; `Mock`/`Stub` exist for
tests. No external system is wired in — the interface leaves room for one
but the current scope is single-process.

### 4. Domain primitives as value objects
`QueryObjectPriority`, `QueryObjectThreshold` and `QueryObjectTimeWindow` are
immutable value objects so policies operate on typed concepts instead of
raw numbers.

### 5. Cross-cutting concerns as decorators
Caching and logging live in `QueryObjectCachingDecorator` /
`QueryObjectLoggingDecorator` wrappers rather than inside `QueryObject`, keeping
the core free of side effects.

## Consequences
- Strategy selection is configuration, not code change.
- Uniform `execute` contract makes per-strategy tests trivial.
- In-memory state is deterministic but not durable — persistence is a
  future adapter.
