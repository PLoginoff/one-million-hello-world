# ADR: Domain Layer

## Status
Accepted

## Context
The system needs a canonical home for core business entities, value objects, and domain events at Layer 10, independent of transport and persistence.

## Decisions

### 1. `IDomainManager` as the entity/event facade
`DomainManager` exposes `createEntity`, `updateEntity`, `deleteEntity`, `getEntity`, and `publishEvent` over `DomainEntity`/`DomainEvent` types. Entities are validated before every mutation (`validateEntity`); updates touch `updatedAt`; missing ids return `{ success: false, error: { code: 'ENTITY_NOT_FOUND' } }`.

### 2. In-memory storage by design
Entities live in a `Map<string, DomainEntity>`; events in `Map<string, DomainEvent[]>`. Persistence is deliberately out of scope — the repository layer below owns durability; the domain layer owns semantics.

### 3. Immutable value objects
`MessageContent`, `CorrelationId`, `RequestId`, `Timestamp` are immutable VOs with `equals()` — identity-free values shared across aggregates can't carry setters.

### 4. Concrete domain model alongside the generic one
`HelloWorldMessage` (entity), `HelloWorldRequested` (event), `MessagePolicy`/`HelloWorldFactory`/`DomainFactory` (services) are the actual business model; the generic `DomainEntity`/`DomainEvent` types are the framework surface.

### 5. Non-throwing results
All operations return `DomainResult { success, value?, error? }` with typed codes (`ENTITY_NOT_FOUND`) — domain failures are data, not exceptions.

*Alternatives rejected:* ORM-managed entities (loss of control, wrong layer), no domain events (blocks event-driven flows), skipping validation (integrity belongs here).

## Consequences
- Clean, testable domain semantics
- In-memory only — durable storage must come from the repository layer
