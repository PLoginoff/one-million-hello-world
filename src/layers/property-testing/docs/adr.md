# ADR: PropertyTesting Layer

## Status
Accepted

## Context
The pipeline requires a dedicated property-testing step (property-based testing) that can be
tuned per deployment without changing call sites.

## Decisions

### 1. Strategy pattern over a single implementation
Five strategies (`default`, `fast`, `reliable`, `cached`,
`batch`) implement `IPropertyTestingStrategy`. Callers pick by name via
`PropertyTestingStrategyFactory`; new strategies register via
`registerStrategy` without touching the factory.

### 2. CQRS-style domain handlers
`PropertyTestingCommandHandler`, `PropertyTestingQueryHandler` and
`PropertyTestingEventHandler` separate write, read and notification concerns;
`PropertyTestingEventObserver` subscribers react to `PropertyTestingExecuted` /
`PropertyTestingFailed`.

### 3. In-memory adapter first
`InMemoryAdapter` is the primary adapter; `Mock`/`Stub` exist for
tests. No external system is wired in — the interface leaves room for one
but the current scope is single-process.

### 4. Domain primitives as value objects
`PropertyTestingPriority`, `PropertyTestingThreshold` and `PropertyTestingTimeWindow` are
immutable value objects so policies operate on typed concepts instead of
raw numbers.

### 5. Cross-cutting concerns as decorators
Caching and logging live in `PropertyTestingCachingDecorator` /
`PropertyTestingLoggingDecorator` wrappers rather than inside `PropertyTesting`, keeping
the core free of side effects.

## Consequences
- Strategy selection is configuration, not code change.
- Uniform `execute` contract makes per-strategy tests trivial.
- In-memory state is deterministic but not durable — persistence is a
  future adapter.
