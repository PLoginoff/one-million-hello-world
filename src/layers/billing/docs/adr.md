# ADR: Billing Layer

## Status
Accepted

## Context
The system requires a billing layer to handle billing concerns.
This layer must be independent, testable, and integrate with the pipeline.

## Decision
Implement Billing as a standalone layer with:
- Interface (IBilling) defining the contract
- Implementation (Billing) with configurable behavior
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
- Layer architecture: docs/billing-layer-architecture.md
- Interface: src/layers/billing/interfaces/IBilling.ts
