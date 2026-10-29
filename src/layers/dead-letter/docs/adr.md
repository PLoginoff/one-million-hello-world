# ADR: DeadLetter Layer

## Status
Accepted

## Decisions

### 1. Uniform `execute(context)` contract
`IDeadLetter` shares the `Context → Result` shape used across pipeline layers so dead-letter handling composes with message-queue and retry layers the same way every other stage does.

### 2. Dedicated `errors/` module
`DeadLetterErrors.ts` centralizes typed error codes for DLQ-specific failures (poison messages, replay attempts) instead of scattering string codes through the implementation.

### 3. Strategy-based processing
Five `IDeadLetterStrategy` implementations selected by `priority`/`canHandle` let the same entry point serve immediate inspection (`fast`), guaranteed persistence (`reliable`), or bulk replay (`batch`).

### 4. Non-throwing results
`execute()` returns `{ success: false, error: { code: 'DEADLETTER_EXECUTION_ERROR' } }` on failure — a DLQ must never itself become a failure source in the message path.

### 5. In-memory domain first
Repository and all domain services run in-memory; durable DLQ storage is an adapter concern to be added downstream without touching the domain model.
