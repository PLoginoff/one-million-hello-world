# ADR: Onboarding Layer

## Status
Accepted

## Context
The pipeline requires a dedicated onboarding step (user onboarding flows and step tracking) that can be
tuned per deployment without changing call sites.

## Decisions

### 1. Strategy pattern over a single implementation
Five strategies (`default`, `fast`, `reliable`, `cached`,
`batch`) implement `IOnboardingStrategy`. Callers pick by name via
`OnboardingStrategyFactory`; new strategies register via
`registerStrategy` without touching the factory.

### 2. CQRS-style domain handlers
`OnboardingCommandHandler`, `OnboardingQueryHandler` and
`OnboardingEventHandler` separate write, read and notification concerns;
`OnboardingEventObserver` subscribers react to `OnboardingExecuted` /
`OnboardingFailed`.

### 3. In-memory adapter first
`InMemoryAdapter` is the primary adapter; `Mock`/`Stub` exist for
tests. No external system is wired in — the interface leaves room for one
but the current scope is single-process.

### 4. Domain primitives as value objects
`OnboardingPriority`, `OnboardingThreshold` and `OnboardingTimeWindow` are
immutable value objects so policies operate on typed concepts instead of
raw numbers.

### 5. Cross-cutting concerns as decorators
Caching and logging live in `OnboardingCachingDecorator` /
`OnboardingLoggingDecorator` wrappers rather than inside `Onboarding`, keeping
the core free of side effects.

## Consequences
- Strategy selection is configuration, not code change.
- Uniform `execute` contract makes per-strategy tests trivial.
- In-memory state is deterministic but not durable — persistence is a
  future adapter.
