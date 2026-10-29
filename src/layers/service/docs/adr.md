# ADR: Service Layer

## Status
Accepted

## Context
Business operations need a registry of use-cases decoupled from
controllers, with a shared context, typed results, and pluggable
execution semantics (sync/async/retry/caching).

## Decisions

### 1. Use-case registry behind `Service`
`Service` (`implementations/Service.ts`) registers `UseCase`s
(`registerUseCase`/`getUseCase`/`clearUseCases`) and runs them through
`execute(input, context)`. A `UseCase` is a named async function —
`execute(input, context) → Promise<ServiceResult<TOutput>>` — so
controllers stay thin and use-cases are independently testable. Built-in
use-cases ship under `use-cases/` (`GetHelloWorldUseCase`,
`GetHealthCheckUseCase`, `GetMetricsUseCase`, `GetVersionUseCase`).

### 2. `ServiceContext` + `ServiceResult` envelope
Every call gets a `ServiceContext` (`types/service-types.ts`) carrying
request-scoped state; results are `ServiceResult<T>` with a typed
`ServiceError` — no exceptions for expected failures.

### 3. Strategy variants for execution semantics
`strategies/strategy/` holds `SynchronousServiceStrategy`,
`AsynchronousServiceStrategy`, `RetryServiceStrategy`,
`CachingServiceStrategy`, `DefaultServiceStrategy` behind
`IServiceStrategy`; the flat `strategies/` also carries the generic
layer strategies and decorator strategies (`LoggingServiceStrategy`,
`MetricsServiceStrategy`, `CachedServiceStrategy`).

### 4. Typed errors per failure mode
`errors/` distinguishes `UseCaseNotFoundError`,
`UseCaseExecutionError`, `RetryExhaustedError`,
`ServiceConfigurationError`, `ServiceError` — callers branch on error
type, not message text.

### 5. Full domain package
`domain/` carries entities (`ServiceEntity`, `ServiceExecution`,
`ServiceConfigState`, `ServiceMetrics`), value objects, services,
repository, specifications, policies, pipeline, decorators, handlers,
events (`ServiceExecuted`/`ServiceFailed`).

## Consequences
- Use-cases are registered and testable in isolation; controllers depend
  only on the `IService` contract.
- Multiple strategy namespaces exist (generic + service-specific) —
  the richer `strategies/strategy/` variants are the semantic ones.
