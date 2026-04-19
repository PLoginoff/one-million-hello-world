# Application Layer Documentation

## Overview
The Application Layer provides application-specific services for event management. This layer coordinates between the Core Layer and other layers, providing high-level abstractions for event handling, dispatching, and registration.

## Components

### Interfaces

#### IEventHandlerRegistry
- **Purpose**: Register and manage event handlers
- **Location**: `application/interfaces/IEventHandlerRegistry.ts`
- **Methods**:
  - `register(eventType, handler, priority)`: Register a handler
  - `unregister(registrationId)`: Unregister a handler
  - `get(eventType)`: Get handlers for event type
  - `getAll()`: Get all handlers
  - `getByPriority(eventType)`: Get handlers sorted by priority
  - `clear()`: Clear all handlers
  - `count()`: Get total handler count
  - `countByType(eventType)`: Get handler count by type

#### IEventDispatcher
- **Purpose**: Dispatch events to registered handlers
- **Location**: `application/interfaces/IEventDispatcher.ts`
- **Methods**:
  - `dispatch(event, options)`: Dispatch single event
  - `dispatchBatch(events, options)`: Dispatch multiple events
  - `addMiddleware(middleware)`: Add middleware
  - `removeMiddleware(middleware)`: Remove middleware

### Types

#### IEventHandler
- **Purpose**: Type definition for event handler
- **Location**: `application/interfaces/types.ts`
- **Signature**: `(event: Event) => void | Promise<void>`

#### IEventMiddleware
- **Purpose**: Type definition for event middleware
- **Location**: `application/interfaces/types.ts`
- **Signature**: `(event: Event, next: () => Promise<void>) => Promise<void>`

#### DispatchOptions
- **Purpose**: Configuration for event dispatching
- **Location**: `application/interfaces/types.ts`
- **Properties**:
  - `async`: Execute handlers asynchronously
  - `timeout`: Handler execution timeout
  - `retryOnFailure`: Retry failed handlers
  - `maxRetries`: Maximum retry attempts

### Implementations

#### EventHandlerRegistry
- **Purpose**: Register and manage event handlers
- **Location**: `application/services/EventHandlerRegistry.ts`
- **Features**:
  - Priority-based handler ordering
  - Unique registration IDs
  - Handler statistics
  - Event type indexing
  - Concurrent registration support

#### EventDispatcher
- **Purpose**: Dispatch events to registered handlers
- **Location**: `application/services/EventDispatcher.ts`
- **Features**:
  - Synchronous and asynchronous dispatching
  - Priority-based handler execution
  - Middleware support
  - Retry policies
  - Timeout management
  - Batch dispatching
  - Execution time tracking
  - Error aggregation

## Design Principles

### Middleware Pattern
EventDispatcher supports middleware for cross-cutting concerns:
- Logging
- Authentication
- Validation
- Transformation

### Strategy Pattern
Dispatch options allow different execution strategies:
- Sync vs async
- With or without retry
- With or without timeout

### Observer Pattern
Handlers subscribe to event types and are notified when events are dispatched.

### Single Responsibility
- EventHandlerRegistry: Handler management
- EventDispatcher: Event dispatching

## Usage Examples

```typescript
import { EventDispatcher, EventHandlerRegistry } from './application';
import { EventBus } from './core';
import { Event, EventBuilder } from './domain';

// Create components
const registry = new EventHandlerRegistry();
const eventBus = new EventBus();
const dispatcher = new EventDispatcher(registry, eventBus);

// Register handlers
const handler1 = (event) => console.log('Handler 1:', event);
const handler2 = (event) => console.log('Handler 2:', event);

registry.register('test.event', handler1, 1);
registry.register('test.event', handler2, 2);

// Dispatch event
const event = EventBuilder.create()
  .withType('test.event')
  .withPayload({ data: 'test' })
  .build();

await dispatcher.dispatch(event);

// Dispatch with options
await dispatcher.dispatch(event, {
  async: true,
  retryOnFailure: true,
  maxRetries: 3,
  timeout: 5000,
});

// Add middleware
const loggingMiddleware = async (event, next) => {
  console.log('Before:', event.type);
  await next();
  console.log('After:', event.type);
};

dispatcher.addMiddleware(loggingMiddleware);

// Dispatch batch
const events = [
  Event.create('event1', {}),
  Event.create('event2', {}),
  Event.create('event3', {}),
];

const results = await dispatcher.dispatchBatch(events);
```

## Integration with Other Layers

- **Domain Layer**: Uses Event entities
- **Core Layer**: Uses EventBus for core operations
- **Infrastructure Layer**: Can integrate with event stores and queues
- **Utils Layer**: Can use EventValidator and EventSerializer
- **Monitoring Layer**: Can integrate with metrics collection
- **Configuration Layer**: Can use EventBusConfig for configuration

## Testing
Application Layer tests are located in `__tests__/application/`:
- `EventHandlerRegistry.test.ts`
- `EventDispatcher.test.ts`

All tests cover registration, dispatching, middleware, retry policies, and edge cases.
