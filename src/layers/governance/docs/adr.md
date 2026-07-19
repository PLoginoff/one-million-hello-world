# ADR: Governance Layer

## Status
Accepted

## Context
The system requires a governance layer to handle governance concerns.
This layer must be independent, testable, and integrate with the pipeline.

## Decision
Implement Governance as a standalone layer with:
- Interface (IGovernance) defining the contract
- Implementation (Governance) with configurable behavior
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
- Layer architecture: docs/governance-layer-architecture.md
- Interface: src/layers/governance/interfaces/IGovernance.ts
