# ADR 006: Middleware Layer Architecture

## Status
Accepted

## Context
The Middleware Layer (Layer 6) is responsible for cross-cutting concerns including logging, metrics, tracing, and correlation ID management. It receives requests from the Validation Layer and applies middleware operations before passing to the Router Layer.

## Decision
We chose to implement the Middleware Layer with the following design:

### Components
1. **IMiddlewareManager Interface**: Defines the contract for middleware operations
2. **MiddlewareManager Implementation**: Concrete manager with logging, metrics, tracing, and correlation
3. **Type Definitions**: Comprehensive types for logs, metrics, spans, and contexts

### Key Design Decisions

**Logging**
- Structured log entries with timestamps
- Multiple log levels (DEBUG, INFO, WARN, ERROR, FATAL)
- Configurable log level filtering
- Context support for additional metadata
- Correlation ID tracking in logs

**Metrics**
- Multiple metric types (COUNTER, GAUGE, HISTOGRAM, SUMMARY)
- Label support for metric categorization
- Timestamp tracking for each metric
- Configurable flush interval
- In-memory metric storage

**Tracing**
- Distributed tracing with trace and span IDs
- Parent-child span relationships
- Operation name tracking
- Automatic duration calculation
- Tag support for span metadata

**Correlation IDs**
- Request ID generation and tracking
- Correlation ID for request tracing
- Trace ID for distributed tracing
- User ID association
- Header-based ID propagation

**Configuration**
- Feature toggles for each middleware component
- Configurable log levels
- Configurable metrics flush interval
- Runtime configuration updates

### Isolation Strategy
- Middleware Layer depends only on Validation Layer types
- Does not depend on any higher layers
- Exports only interfaces to Router Layer
- Implementation details hidden behind interface

## Consequences

### Positive
- Comprehensive observability
- Flexible configuration
- Request tracing across layers
- Structured logging
- Performance metrics

### Negative
- Memory overhead from log/metric storage
- Performance impact from middleware operations
- Complexity from multiple concerns
- ID generation overhead

### Alternatives Considered
1. **Use Winston for logging**: Rejected for control and learning purposes
2. **Use Prometheus for metrics**: Rejected for simplicity
3. **Use OpenTelemetry for tracing**: Rejected for control
4. **Separate layers for each concern**: Rejected for cohesion

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- ADR 001 - Network Layer Architecture
- ADR 002 - HTTP Parser Layer Architecture
- ADR 003 - Security Layer Architecture
- ADR 004 - Rate Limiting Layer Architecture
- ADR 005 - Validation Layer Architecture
