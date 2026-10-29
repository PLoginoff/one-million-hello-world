# ADR: Observability Layer

## Status
Accepted

## Context
The pipeline requires a dedicated observability step (metrics, logs and traces aggregation) that can be
tuned per deployment without changing call sites.

## Decisions

### 1. Strategy pattern over a single implementation
Five strategies (`default`, `fast`, `reliable`, `cached`,
`batch`) implement `IObservabilityStrategy`. Callers pick by name via
`ObservabilityStrategyFactory`; new strategies register via
`registerStrategy` without touching the factory.

### 2. CQRS-style domain handlers
`ObservabilityCommandHandler`, `ObservabilityQueryHandler` and
`ObservabilityEventHandler` separate write, read and notification concerns;
`ObservabilityEventObserver` subscribers react to `ObservabilityExecuted` /
`ObservabilityFailed`.

### 3. In-memory adapter first
`InMemoryAdapter` is the primary adapter; `Mock`/`Stub` exist for
tests. No external system is wired in — the interface leaves room for one
but the current scope is single-process.

### 4. Domain primitives as value objects
`ObservabilityPriority`, `ObservabilityThreshold` and `ObservabilityTimeWindow` are
immutable value objects so policies operate on typed concepts instead of
raw numbers.

### 5. Cross-cutting concerns as decorators
Caching and logging live in `ObservabilityCachingDecorator` /
`ObservabilityLoggingDecorator` wrappers rather than inside `Observability`, keeping
the core free of side effects.

## Consequences
- Strategy selection is configuration, not code change.
- Uniform `execute` contract makes per-strategy tests trivial.
- In-memory state is deterministic but not durable — persistence is a
  future adapter.
