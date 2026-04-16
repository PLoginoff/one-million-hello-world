# ADR: Retry Layer Architecture

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

## Detailed Documentation

For detailed information about specific aspects of the Retry Layer, see:

- [Architecture Overview](../src/layers/retry/docs/architecture.md) - Components, isolation strategy, consequences
- [Retry Strategies](../src/layers/retry/docs/retry-strategies.md) - Exponential, fixed, linear backoff
- [Delay Calculation](../src/layers/retry/docs/delay-calculation.md) - Base delay, max delay cap
- [Jitter Implementation](../src/layers/retry/docs/jitter-implementation.md) - Random variation, thundering herd prevention
- [Attempt Management](../src/layers/retry/docs/attempt-management.md) - Max attempts, counting, error propagation
- [Testing Strategy](../src/layers/retry/docs/testing.md) - Unit/integration tests, performance tests, coverage targets

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
- circuit-breaker-layer-architecture.md - Circuit Breaker Layer Architecture
