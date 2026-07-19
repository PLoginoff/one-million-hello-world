# ADR: Scheduling Layer

## Status
Accepted

## Context
The system requires a scheduling layer to handle scheduling concerns.
This layer must be independent, testable, and integrate with the pipeline.

## Decision
Implement Scheduling as a standalone layer with:
- Interface (IScheduling) defining the contract
- Implementation (Scheduling) with configurable behavior
- Domain model (entity, value object, domain service)
- Health check, metrics collector, and error mapper
- Adapters where applicable (in-memory + real service)

## Consequences
**Positive:**
- Clear separation of concerns
- Independent testability
- Pluggable adapters for different backends

**Negative:**
- Additional abstraction layer
- Slight overhead from indirection

## Alternatives Considered
1. Inline logic in controller — rejected: tight coupling
2. Utility module — rejected: no interface contract
3. External library — rejected: vendor lock-in risk

## References
- Layer architecture: docs/scheduling-layer-architecture.md
- Interface: src/layers/scheduling/interfaces/IScheduling.ts
