# ADR: EtlPipeline Layer

## Status
Accepted

## Context
The architecture requires a dedicated EtlPipeline layer to handle etl pipeline concerns.

## Decision
Introduce EtlPipeline as an isolated layer with interface, implementation, domain model, strategies, factories, configuration, and metrics.

## Consequences
- Improved separation of concerns
- Testable in isolation
- Configurable at runtime
- Adds measurable overhead in terms of file count and lines of code

## Position
N/A
