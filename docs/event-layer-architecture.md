# ADR: Event Layer Architecture

## Status
Accepted

## Context
The Event Layer is responsible for event bus, Pub/Sub, and domain event propagation. It receives requests from the Cache Layer and provides event-driven communication capabilities.

## Decision
We chose to implement the Event Layer with the following design:

### Components
1. **IEventBus Interface**: Defines the contract for event bus operations
2. **EventBus Implementation**: Concrete event bus with Pub/Sub support
3. **Type Definitions**: Comprehensive types for handlers, subscriptions, and statistics

### Key Design Decisions

**Event Bus Pattern**
- Publish/Subscribe model
- Event-based communication
- Multiple handler support
- Subscription management

**Subscription Management**
- Subscribe with persistent handler
- Subscribe once (auto-unsubscribe)
- Unsubscribe by ID
- Clear all subscriptions

**Async Publishing**
- Synchronous publish option
- Asynchronous publish option
- Configurable async behavior
- Promise-based async operations

**Error Handling**
- Handler error catching
- Error statistics tracking
- Non-blocking error handling
- Error count monitoring

**Statistics Tracking**
- Publish count tracking
- Handler count tracking
- Error count tracking
- Subscription count tracking

**Configuration**
- Async enable/disable
- Persistence toggle
- Queue size limit
- Runtime configuration updates

### Isolation Strategy
- Event Layer depends only on Cache Layer types
- Does not depend on any higher layers
- Exports only interfaces to Message Queue Layer
- Implementation details hidden behind interface

## Detailed Documentation

For detailed information about specific aspects of the Event Layer, see:

- [Architecture Overview](../src/layers/event/docs/architecture.md) - Components, isolation strategy, consequences
- [Event Bus](../src/layers/event/docs/event-bus.md) - Event bus implementation, publishing
- [Subscription Management](../src/layers/event/docs/subscription-management.md) - Subscriptions, filtering, persistence
- [Async Publishing](../src/layers/event/docs/async-publishing.md) - Async operations, retry logic
- [Error Handling](../src/layers/event/docs/error-handling.md) - Error catching, statistics, recovery
- [Statistics Tracking](../src/layers/event/docs/statistics-tracking.md) - Publish/handler tracking, performance monitoring
- [Testing Strategy](../src/layers/event/docs/testing.md) - Unit/integration tests, performance tests, coverage targets

## Consequences

### Positive
- Decoupled communication
- Event-driven architecture
- Flexible subscription model
- Async support
- Statistics for monitoring

### Negative
- Event overhead
- Subscription management complexity
- Error handling overhead
- Memory overhead from subscriptions

### Alternatives Considered
1. **Use EventEmitter**: Rejected for control and learning purposes
2. **Direct function calls**: Rejected for decoupling
3. **No async support**: Rejected for performance
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
