# Architecture Decision Records

This directory contains ADRs for major architectural decisions.

## Index

| ADR | Title |
|-----|-------|
| [ADR-001](ADR-001.md) | Layered Architecture |
| [ADR-002](ADR-002.md) | TypeScript as Implementation Language |
| [ADR-003](ADR-003.md) | Interface-Based Layer Contracts |
| [ADR-004](ADR-004.md) | Domain-Driven Design per Layer |
| [ADR-005](ADR-005.md) | Health Check Pattern |
| [ADR-006](ADR-006.md) | Prometheus Metrics Export |
| [ADR-007](ADR-007.md) | Error Taxonomy and Mapping |
| [ADR-008](ADR-008.md) | Adapter Pattern for External Dependencies |
| [ADR-009](ADR-009.md) | Strategy Pattern for Configurable Behavior |
| [ADR-010](ADR-010.md) | Composite and Conditional Validation |
| [ADR-011](ADR-011.md) | Circuit Breaker for Resilience |
| [ADR-012](ADR-012.md) | Event Sourcing and CQRS |
| [ADR-013](ADR-013.md) | Multi-Tenancy Isolation |
| [ADR-014](ADR-014.md) | ML and Intelligence Layers |
| [ADR-015](ADR-015.md) | FinOps and Cost Optimization |

## How to Write an ADR

1. Copy the template below
2. Fill in Context, Decision, Consequences
3. Number sequentially (ADR-016, ADR-017, ...)
4. Link to relevant code and layer docs

## Template

```markdown
# ADR-XXX: Title

## Status
Accepted (or Proposed, Deprecated, Superseded)

## Date
YYYY-MM-DD

## Context
Why is this decision needed?

## Decision
What was decided?

## Consequences
What are the impacts (positive and negative)?
```
