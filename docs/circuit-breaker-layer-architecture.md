# ADR: Circuit Breaker Layer Architecture

## Status
Accepted

## Context
The Circuit Breaker Layer is responsible for fault tolerance and fallback strategies. It receives requests from the Compression Layer and provides circuit breaker capabilities.

## Decision
We chose to implement the Circuit Breaker Layer with the following design:

### Components
1. **ICircuitBreaker Interface**: Defines the contract for circuit breaker operations
2. **CircuitBreaker Implementation**: Concrete circuit breaker with state management
3. **Type Definitions**: Comprehensive types for states, statistics, and configuration

### Key Design Decisions

**Circuit States**
- Closed state (normal operation)
- Open state (failures exceed threshold)
- Half-open state (testing recovery)
- Automatic state transitions

**Failure Handling**
- Failure threshold tracking
- Automatic circuit opening
- Reset timeout management
- Failure count reset on success

**Fallback Strategies**
- Fallback function support
- Fallback execution on failure
- Fallback error handling
- Graceful degradation

**Statistics Tracking**
- Success count tracking
- Failure count tracking
- Last failure time tracking
- Current state tracking

**Configuration**
- Failure threshold configuration
- Success threshold configuration
- Timeout configuration
- Reset timeout configuration

### Isolation Strategy
- Circuit Breaker Layer depends only on Compression Layer types
- Does not depend on any higher layers
- Exports only interfaces to Retry Layer
- Implementation details hidden behind interface

## Detailed Documentation

For detailed information about specific aspects of the Circuit Breaker Layer, see:

- [Architecture Overview](../src/layers/circuit-breaker/docs/architecture.md) - Components, isolation strategy, consequences
- [Circuit States](../src/layers/circuit-breaker/docs/circuit-states.md) - State management, transitions
- [Failure Handling](../src/layers/circuit-breaker/docs/failure-handling.md) - Failure tracking, timeout management
- [Fallback Strategies](../src/layers/circuit-breaker/docs/fallback-strategies.md) - Fallback execution, graceful degradation
- [Statistics Tracking](../src/layers/circuit-breaker/docs/statistics-tracking.md) - Success/failure tracking, rates
- [Testing Strategy](../src/layers/circuit-breaker/docs/testing.md) - Unit/integration tests, performance tests, coverage targets

## Consequences

### Positive
- Fault tolerance
- Automatic recovery
- Fallback support
- Statistics for monitoring
- Configurable thresholds

### Negative
- Circuit breaker overhead
- State management complexity
- Fallback execution overhead
- Memory overhead from statistics

### Alternatives Considered
1. **Use opossum**: Rejected for control and learning purposes
2. **No fallback**: Rejected for resilience
3. **No half-open state**: Rejected for recovery testing
4. **No statistics**: Rejected for observability

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- network-layer-architecture.md - Network Layer Architecture
- http-parser-layer-architecture.md - HTTP Parser Layer Architecture
- security-layer-architecture.md - Security Layer Architecture
- rate-limiting-layer-architecture.md - Rate Limiting Layer Architecture
- validation-layer-architecture.md - Validation Layer Architecture
- middleware-layer-architecture.md - Middleware Layer Architecture
- router-layer-architecture.md - Router Layer Architecture
- controller-layer-architecture.md - Controller Layer Architecture
- service-layer-architecture.md - Service Layer Architecture
- domain-layer-architecture.md - Domain Layer Architecture
- repository-layer-architecture.md - Repository Layer Architecture
- cache-layer-architecture.md - Cache Layer Architecture
- event-layer-architecture.md - Event Layer Architecture
- message-queue-layer-architecture.md - Message Queue Layer Architecture
- data-transformation-layer-architecture.md - Data Transformation Layer Architecture
- serialization-layer-architecture.md - Serialization Layer Architecture
- compression-layer-architecture.md - Compression Layer Architecture
