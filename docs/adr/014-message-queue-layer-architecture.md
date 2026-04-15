# ADR 014: Message Queue Layer Architecture

## Status
Accepted

## Context
The Message Queue Layer (Layer 14) is responsible for async processing and dead letter queues. It receives requests from the Event Layer and provides message queue capabilities for asynchronous task processing.

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
