# ADR: Specification Layer

## Status
Accepted

## Context
Specification pattern layer needs a single entry point with swappable
execution semantics and a consistent result shape, without coupling
callers to a specific backend.

## Decisions

### 1. Uniform `execute(context)` contract
Every public surface (`Specification` facade, strategies, adapters) accepts a
`SpecificationContext` (`input`, `metadata`, `timestamp`) and returns
`SpecificationResult<T>` (`success`, `data?`, `error?`). Expected failures
travel inside the result envelope instead of thrown exceptions.

### 2. Priority-ordered strategy set
Five strategies share `ISpecificationStrategy` and self-describe with `name`
and `priority` (default=0, batch=3, reliable=5, cached=7, fast=10).
`SpecificationStrategyFactory` instantiates by name and orders by priority so
callers can pick explicitly or take the highest-priority handler that
`canHandle()` accepts.

### 3. Rich domain package kept separate from the facade
Entities, value objects, services, repository, specifications, policies,
pipeline, decorators, and handlers live under `domain/` and are tested
in isolation. The facade stays thin and does not depend on domain
internals.

### 4. Interchangeable adapters
`InMemoryAdapter`, `MockAdapter`, and `StubAdapter` implement the
same `ISpecification` contract so tests can substitute backends without
changing call sites.

## Consequences
- Adding an execution flavor means adding one strategy class and a
  factory mapping — no changes to callers.
- The result envelope makes failure paths uniform and easy to assert in
  tests.
- Strategies are currently generic placeholders; layer-specific
  semantics would slot in as new strategies or domain services without
  structural change.
