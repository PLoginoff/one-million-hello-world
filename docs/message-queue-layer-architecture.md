# ADR: Message Queue Layer Architecture

## Status
Accepted

## Context
The Message Queue Layer is responsible for async processing and dead letter queues. It receives requests from the Event Layer and provides message queue capabilities for asynchronous task processing.

## Decision
We chose to implement the Message Queue Layer with the following design:

### Components
1. **IMessageQueue Interface**: Defines the contract for message queue operations
2. **MessageQueue Implementation**: Concrete queue with priority and retry support
3. **Type Definitions**: Comprehensive types for messages, statistics, and configuration

### Key Design Decisions

**Queue Management**
- Enqueue with priority support
- Dequeue with handler execution
- Priority-based message ordering
- Maximum queue size limit

**Retry Mechanism**
- Configurable max retries
- Retry delay configuration
- Automatic retry on failure
- Attempt tracking per message

**Dead Letter Queue**
- Failed message storage
- Configurable dead letter enablement
- Dead letter statistics
- Dead letter retrieval

**Automatic Processing**
- Handler registration
- Start/stop processing control
- Processing state management
- Concurrent processing prevention

**Statistics Tracking**
- Queued message count
- Processed message count
- Failed message count
- Dead letter count

**Configuration**
- Max retries configuration
- Retry delay configuration
- Dead letter toggle
- Queue size limit

### Isolation Strategy
- Message Queue Layer depends only on Event Layer types
- Does not depend on any higher layers
- Exports only interfaces to Data Transformation Layer
- Implementation details hidden behind interface

## Detailed Documentation

For detailed information about specific aspects of the Message Queue Layer, see:

- [Architecture Overview](../src/layers/message-queue/docs/architecture.md) - Components, isolation strategy, consequences
- [Queue Management](../src/layers/message-queue/docs/queue-management.md) - Enqueue/dequeue, priority queue
- [Retry Mechanism](../src/layers/message-queue/docs/retry-mechanism.md) - Retry configuration, attempt tracking
- [Dead Letter Queue](../src/layers/message-queue/docs/dead-letter-queue.md) - Failed message storage, retrieval
- [Automatic Processing](../src/layers/message-queue/docs/automatic-processing.md) - Handler registration, processing control
- [Statistics Tracking](../src/layers/message-queue/docs/statistics-tracking.md) - Queue statistics, performance monitoring
- [Testing Strategy](../src/layers/message-queue/docs/testing.md) - Unit/integration tests, performance tests, coverage targets

## Consequences

### Positive
- Asynchronous processing support
- Priority-based queuing
- Retry mechanism for reliability
- Dead letter queue for failed messages
- Statistics for monitoring

### Negative
- Queue management complexity
- Retry overhead
- Memory overhead from queue storage
- Processing delay from async operations

### Alternatives Considered
1. **Use RabbitMQ**: Rejected for simplicity and learning purposes
2. **No retry mechanism**: Rejected for reliability
3. **No dead letter queue**: Rejected for error handling
4. **No priority support**: Rejected for flexibility

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
