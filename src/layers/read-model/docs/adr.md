# ADR: ReadModel Layer

## Status
Accepted

## Context
The pipeline requires a dedicated read-model step (read model projections) that can be
tuned per deployment without changing call sites.

## Decisions

### 1. Strategy pattern over a single implementation
Five strategies (`default`, `fast`, `reliable`, `cached`,
`batch`) implement `IReadModelStrategy`. Callers pick by name via
`ReadModelStrategyFactory`; new strategies register via
`registerStrategy` without touching the factory.

### 2. CQRS-style domain handlers
`ReadModelCommandHandler`, `ReadModelQueryHandler` and
`ReadModelEventHandler` separate write, read and notification concerns;
`ReadModelEventObserver` subscribers react to `ReadModelExecuted` /
`ReadModelFailed`.

### 3. In-memory adapter first
`InMemoryAdapter` is the primary adapter; `Mock`/`Stub` exist for
tests. No external system is wired in — the interface leaves room for one
but the current scope is single-process.

### 4. Domain primitives as value objects
`ReadModelPriority`, `ReadModelThreshold` and `ReadModelTimeWindow` are
immutable value objects so policies operate on typed concepts instead of
raw numbers.

### 5. Cross-cutting concerns as decorators
Caching and logging live in `ReadModelCachingDecorator` /
`ReadModelLoggingDecorator` wrappers rather than inside `ReadModel`, keeping
the core free of side effects.

## Consequences
- Strategy selection is configuration, not code change.
- Uniform `execute` contract makes per-strategy tests trivial.
- In-memory state is deterministic but not durable — persistence is a
  future adapter.
