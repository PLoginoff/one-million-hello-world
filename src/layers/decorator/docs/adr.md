# ADR: Decorator Layer

## Status
Accepted

## Context
Cross-cutting concerns (logging, metrics) need to wrap operations at runtime with an auditable record of what was applied.

## Decisions

### 1. Decoration tracked in the result
`DecoratorResult` always carries the `decorators: string[]` applied — callers and tests can assert exactly which cross-cutting concerns ran, rather than inferring from side effects.

### 2. Config-gated built-ins
`enableLogging`/`enableMetrics` (default `false`) add named decorators automatically; caller-supplied names pass through. Built-ins are opt-in so undecorated execution is the default.

### 3. Errors as results
`execute()` catches operation failures into `{ success: false, error }` — a decorated operation failing doesn't crash the decoration pipeline, and the applied-decorator list survives the failure for diagnostics.

### 4. Runtime over compile-time decoration
Operations are wrapped at call time (`execute(operation, decorators)`) rather than via TS decorators — dynamic composition, no metadata/reflect dependencies.

*Alternative rejected:* compile-time decorators — no runtime toggling, harder to audit.

## Consequences
- Auditable, toggleable cross-cutting behavior
- Result shape carries decorator metadata — slight payload overhead
- No real decorator implementations are invoked (names are tracked) — actual logging/metrics behavior lives in the wrapped operation or downstream middleware
