# Decorator Layer Architecture

## Position
Layer 24 of the 25-layer architecture. Responsibility: runtime decoration and cross-cutting concerns around operations.

## Core Contract
`IDecorator` (`interfaces/IDecorator.ts`) exposes:

- `execute<T>(operation: () => Promise<T>, decorators: string[]): Promise<DecoratorResult<T>>` — runs `operation`, then reports which decorators applied. Config toggles add built-ins: `enableLogging` adds `'logging'`, `enableMetrics` adds `'metrics'` — merged with the caller-supplied `decorators` list in the result.
- `setConfig(config: DecoratorConfig)` — merges `{ enableLogging, enableMetrics }` (both default `false`)
- `getConfig(): DecoratorConfig` — copy of current config

`Decorator` (`implementations/Decorator.ts`) implements it. `DecoratorResult<T> = { success, data?, decorators: string[], error? }` — on failure `error` carries the message and `decorators` still reports what was applied before the operation ran.

## Design notes
- Decoration is **tracked, not opaque**: the result always lists applied decorator names — auditable cross-cutting behavior.
- `execute()` catches operation errors into `DecoratorResult` — the decorated operation can fail without the decorator pipeline throwing.
- Built-in decorators are config-gated; caller-named decorators pass through, so the result is a faithful record of the decoration context.

## Strategies & domain
Standard five `IDecoratorStrategy` implementations (`default`, `fast`, `reliable`, `cached`, `batch`) via `DecoratorStrategyFactory`, plus the shared DDD domain model under `domain/` (entities, services, events, handlers, repository, specifications, policies).

## Supporting
`adapters/` (InMemory, Mock, Stub), `configuration/` (builders, defaults, validators), `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`DecoratorError`, `DecoratorErrorMapper`).

## Detail docs
`runtime-decoration.md`, `cross-cutting-concerns.md`, `decorator-management.md`
