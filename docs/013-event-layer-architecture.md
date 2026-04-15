# ADR 013: Event Layer Architecture

## Status
Accepted

## Context
The Event Layer (Layer 13) is responsible for event bus, Pub/Sub, and domain event propagation. It receives requests from the Cache Layer and provides event-driven communication capabilities.

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
