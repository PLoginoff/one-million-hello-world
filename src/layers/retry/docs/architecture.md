# Retry Layer Architecture

## Status
Accepted

## Context
The Retry Layer is responsible for exponential backoff, jitter, and idempotency. It receives requests from the Circuit Breaker Layer and provides retry capabilities.

## Decision
We chose to implement the Retry Layer with the following design:

### Components
1. **IRetryPolicy Interface**: Defines the contract for retry operations
2. **RetryPolicy Implementation**: Concrete retry policy with backoff strategies
3. **Type Definitions**: Comprehensive types for strategies, results, and configuration

### Key Design Decisions

**Retry Strategies**
- Exponential backoff (default)
- Fixed delay
- Linear backoff
- Configurable strategy selection

**Delay Calculation**
- Base delay configuration
- Max delay cap
- Strategy-specific calculation
- Jitter support for randomness

**Jitter Implementation**
- Random delay variation
- Configurable jitter toggle
- 10% jitter by default
- Prevents thundering herd

**Attempt Management**
- Max attempts configuration
- Attempt counting
- Error propagation
- Success on first success

**Configuration**
- Max attempts setting
- Strategy configuration
- Delay configuration
- Jitter toggle

### Isolation Strategy
- Retry Layer depends only on Circuit Breaker Layer types
- Does not depend on any higher layers
- Exports only interfaces to Saga Layer
- Implementation details hidden behind interface

## Consequences

### Positive
- Multiple retry strategies
- Exponential backoff
- Jitter for distributed systems
- Configurable behavior
- Attempt tracking

### Negative
- Retry overhead
- Delay complexity
- Jitter calculation overhead
- Memory overhead from attempts

### Alternatives Considered
1. **Use retry library**: Rejected for control and learning purposes
2. **No jitter**: Rejected for distributed systems
3. **Single strategy**: Rejected for flexibility
4. **No max delay**: Rejected for safety

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- retry-strategies.md - Retry strategies
- delay-calculation.md - Delay calculation
- jitter-implementation.md - Jitter implementation
- attempt-management.md - Attempt management
- testing.md - Testing strategy
