# ADR 018: Circuit Breaker Layer Architecture

## Status
Accepted

## Context
The Circuit Breaker Layer (Layer 18) is responsible for fault tolerance and fallback strategies. It receives requests from the Compression Layer and provides circuit breaker capabilities.

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
- ADR 001 - Network Layer Architecture
- ADR 002 - HTTP Parser Layer Architecture
- ADR 003 - Security Layer Architecture
- ADR 004 - Rate Limiting Layer Architecture
- ADR 005 - Validation Layer Architecture
- ADR 006 - Middleware Layer Architecture
- ADR 007 - Router Layer Architecture
- ADR 008 - Controller Layer Architecture
- ADR 009 - Service Layer Architecture
- ADR 010 - Domain Layer Architecture
- ADR 011 - Repository Layer Architecture
- ADR 012 - Cache Layer Architecture
- ADR 013 - Event Layer Architecture
- ADR 014 - Message Queue Layer Architecture
- ADR 015 - Data Transformation Layer Architecture
- ADR 016 - Serialization Layer Architecture
- ADR 017 - Compression Layer Architecture
