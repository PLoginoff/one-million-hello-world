# Infrastructure Layer Documentation

## Overview
The Infrastructure Layer provides implementations for external concerns such as event persistence, publishing, subscribing, and queuing. This layer isolates infrastructure dependencies from the core business logic, enabling easy swapping of implementations.

## Components

### Interfaces

#### IEventStore
- **Purpose**: Persist and retrieve events
- **Location**: `infrastructure/interfaces/IEventStore.ts`
- **Methods**:
  - `save(event)`: Save an event
  - `get(eventId)`: Retrieve an event by ID
  - `getAll()`: Retrieve all events
  - `getByType(eventType)`: Retrieve events by type
  - `getByCorrelationId(correlationId)`: Retrieve events by correlation ID
  - `delete(eventId)`: Delete an event
  - `clear()`: Clear all events
  - `count()`: Get total event count

#### IEventPublisher
- **Purpose**: Publish events to external systems
- **Location**: `infrastructure/interfaces/IEventPublisher.ts`
- **Methods**:
  - `publish(event)`: Publish an event
  - `publishBatch(events)`: Publish multiple events
  - `connect()`: Connect to external system
  - `disconnect()`: Disconnect from external system
  - `isConnected()`: Check connection status

#### IEventSubscriber
- **Purpose**: Subscribe to events from external systems
- **Location**: `infrastructure/interfaces/IEventSubscriber.ts`
- **Methods**:
  - `subscribe(eventType, handler)`: Subscribe to event type
  - `unsubscribe(eventType)`: Unsubscribe from event type
  - `start()`: Start receiving events
  - `stop()`: Stop receiving events
  - `isRunning()`: Check if subscriber is running

#### IEventQueue
- **Purpose**: Manage buffered event processing
- **Location**: `infrastructure/interfaces/IEventQueue.ts`
- **Methods**:
  - `enqueue(event)`: Add event to queue
  - `dequeue()`: Remove event from queue
  - `peek()`: Look at next event without removing
  - `size()`: Get queue size
  - `clear()`: Clear queue
  - `isEmpty()`: Check if queue is empty
  - `process(handler)`: Process events in queue

### Implementations

#### MemoryEventStore
- **Purpose**: In-memory event storage
- **Location**: `infrastructure/implementations/MemoryEventStore.ts`
- **Features**:
  - Fast in-memory storage
  - Event type indexing
  - Correlation ID indexing
  - Event time-series support
  - Statistics tracking
  - Thread-safe operations

#### MemoryEventQueue
- **Purpose**: In-memory event queue
- **Location**: `infrastructure/implementations/MemoryEventQueue.ts`
- **Features**:
  - FIFO ordering
  - Priority queue support
  - Bounded queue with max size
  - Queue statistics
  - Batch processing
  - Timeout support

#### ConsoleEventPublisher
- **Purpose**: Publish events to console
- **Location**: `infrastructure/implementations/ConsoleEventPublisher.ts`
- **Features**:
  - Console logging of events
  - Formatted event output
  - Connection management (simulated)
  - Batch publishing support
  - Error handling

## Design Principles

### Interface-Based Design
All infrastructure components implement interfaces, enabling:
- Easy testing with mocks
- Alternative implementations
- Configuration-based selection

### Separation of Concerns
Each infrastructure component handles a single external concern:
- EventStore: Persistence
- EventPublisher: External publishing
- EventSubscriber: External subscription
- EventQueue: Buffered processing

### Dependency Inversion
Core layers depend on interfaces, not implementations, following the Dependency Inversion Principle.

## Usage Examples

```typescript
import { MemoryEventStore, MemoryEventQueue, ConsoleEventPublisher } from './infrastructure';
import { Event } from './domain';

// Event storage
const eventStore = new MemoryEventStore();
await eventStore.save(Event.create('test.event', {}));
const retrieved = await eventStore.get('event-id');

// Event queue
const eventQueue = new MemoryEventQueue();
await eventQueue.enqueue(Event.create('test.event', {}));
const size = await eventQueue.size();
const event = await eventQueue.dequeue();

// Event publishing
const publisher = new ConsoleEventPublisher();
await publisher.connect();
await publisher.publish(Event.create('test.event', {}));
await publisher.disconnect();
```

## Integration with Other Layers

- **Domain Layer**: Stores and retrieves Event entities
- **Core Layer**: Can be used by EventBus for persistence and queuing
- **Application Layer**: Used by EventDispatcher for event management
- **Monitoring Layer**: Can integrate with metrics collection

## Future Implementations

Potential future implementations:
- `RedisEventStore`: Redis-based persistence
- `PostgresEventStore`: PostgreSQL persistence
- `KafkaEventPublisher`: Kafka publishing
- `RabbitMQEventQueue`: RabbitMQ queue
- `SQSEventQueue`: AWS SQS queue
- `WebSocketEventSubscriber`: WebSocket subscription

## Testing
Infrastructure Layer tests are located in `__tests__/infrastructure/`:
- `MemoryEventStore.test.ts`
- `MemoryEventQueue.test.ts`
- `ConsoleEventPublisher.test.ts`

All tests cover storage, retrieval, queue operations, and edge cases.
