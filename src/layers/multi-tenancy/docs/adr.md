# ADR: MultiTenancy Layer

## Status
Accepted

## Context
The pipeline requires a dedicated multi-tenancy step (multi-tenant context and isolation strategies) that can be
tuned per deployment without changing call sites.

## Decisions

### 1. Strategy pattern over a single implementation
Five strategies (`default`, `fast`, `reliable`, `cached`,
`batch`) implement `IMultiTenancyStrategy`. Callers pick by name via
`MultiTenancyStrategyFactory`; new strategies register via
`registerStrategy` without touching the factory.

### 2. CQRS-style domain handlers
`MultiTenancyCommandHandler`, `MultiTenancyQueryHandler` and
`MultiTenancyEventHandler` separate write, read and notification concerns;
`MultiTenancyEventObserver` subscribers react to `MultiTenancyExecuted` /
`MultiTenancyFailed`.

### 3. In-memory adapter first
`InMemoryAdapter` is the primary adapter; `Mock`/`Stub` exist for
tests. No external system is wired in — the interface leaves room for one
but the current scope is single-process.

### 4. Domain primitives as value objects
`MultiTenancyPriority`, `MultiTenancyThreshold` and `MultiTenancyTimeWindow` are
immutable value objects so policies operate on typed concepts instead of
raw numbers.

### 5. Cross-cutting concerns as decorators
Caching and logging live in `MultiTenancyCachingDecorator` /
`MultiTenancyLoggingDecorator` wrappers rather than inside `MultiTenancy`, keeping
the core free of side effects.

## Consequences
- Strategy selection is configuration, not code change.
- Uniform `execute` contract makes per-strategy tests trivial.
- In-memory state is deterministic but not durable — persistence is a
  future adapter.
