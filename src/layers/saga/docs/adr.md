# ADR: Saga Layer

## Status
Accepted

## Context
Distributed transactions need compensation (undo) semantics, step
tracking, and observability, with each concern independently testable.

## Decisions

### 1. Multi-layer abstraction over a single facade
`SagaManager` delegates to `SagaOrchestrator` → `StepExecutor` +
`CompensationOrchestrator` + `SagaState` + `ErrorHandler`, with
`SagaValidator` and `Logger` alongside. Each collaborator is behind an
interface (`interfaces/`) so tests inject fakes per concern instead of
mocking a monolith.

### 2. Sequential steps with reverse-order compensation
`StepExecutor` runs steps in order; on failure
`CompensationOrchestrator` runs compensation via `CompensationStrategy`
in reverse. `SagaConfig.enableCompensation` toggles it.

### 3. Explicit state object
`SagaState` tracks executed/compensated steps, status
(`SagaStatus`), and error messages with snapshots — needed for audit
and resume, kept separate from execution logic.

### 4. Severity-driven error handling
`ErrorHandler` classifies errors (`ErrorSeverity`) so compensation is
triggered by severity, not merely by "an exception happened".

### 5. Extended subsystems layered on top
`application/use-cases/` (`ExecuteSaga`, `CompensateSaga`,
`RetrySaga`, `MonitorSaga`), `orchestration/` (`OrchestratorPattern`,
`ChoreographyPattern`), `persistence/adapters/` (PostgreSQL, MongoDB,
Redis), `integration/event-bus/` (Kafka, RabbitMQ),
`monitoring/` (`SagaTracer`, `SagaAlertManager`), `analytics/`,
`security/`, and `testing/` (`SagaTestBuilder`, `SagaTestRunner`) extend
the core without bloating it.

## Consequences
- More files and interfaces than a minimal saga, but each piece is
  unit-testable in isolation — see the flat `__tests__/` suite covering
  every collaborator.
- Compensation semantics are explicit and configurable, at the cost of
  orchestration overhead per step.
