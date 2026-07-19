# ADR: SecretsRotation Layer

## Status
Accepted

## Context
The system requires a secrets rotation layer to handle secrets rotation concerns.
This layer must be independent, testable, and integrate with the pipeline.

## Decision
Implement SecretsRotation as a standalone layer with:
- Interface (ISecretsRotation) defining the contract
- Implementation (SecretsRotation) with configurable behavior
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
- Layer architecture: docs/secrets-rotation-layer-architecture.md
- Interface: src/layers/secrets-rotation/interfaces/ISecretsRotation.ts
