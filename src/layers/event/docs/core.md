# Core Layer Documentation

## Overview
The Core Layer provides the central event bus implementation and core logic for event management. This layer orchestrates event subscription, publishing, and execution while maintaining separation of concerns through dedicated components.

## Components

### Interfaces

#### IEventBus
- **Purpose**: Central interface for event operations
- **Location**: `core/interfaces/IEventBus.ts`
- **Methods**:
  - `subscribe(eventType, handler)`: Subscribe to events
  - `unsubscribe(eventType, handler)`: Unsubscribe from events
  - `publish(event)`: Publish an event
  - `publishAsync(event)`: Publish event asynchronously
  - `getSubscribers(eventType)`: Get subscribers for event type
  - `getStatistics()`: Get event bus statistics

#### ISubscriptionManager
- **Purpose**: Manage event subscriptions
- **Location**: `core/interfaces/ISubscriptionManager.ts`
- **Methods**:
  - `subscribe(eventType, handler, priority)`: Add subscription
  - `unsubscribe(eventType, handler)`: Remove subscription
  - `getSubscribers(eventType)`: Get subscribers for event type
  - `hasSubscription(eventType, handler)`: Check subscription exists
  - `clear()`: Clear all subscriptions
  - `getStatistics()`: Get subscription statistics

#### IErrorHandler
- **Purpose**: Handle errors during event processing
- **Location**: `core/interfaces/IErrorHandler.ts`
- **Methods**:
  - `handle(error, event, handler)`: Handle an error
  - `setStrategy(strategy)`: Set error handling strategy
  - `getStrategy()`: Get current strategy
  - `getErrorCount()`: Get total error count
  - `getErrorDetails()`: Get error details

#### IEventExecutor
- **Purpose**: Execute event handlers
- **Location**: `core/interfaces/IEventExecutor.ts`
- **Methods**:
  - `execute(handler, event)`: Execute handler synchronously
  - `executeAsync(handler, event)`: Execute handler asynchronously
  - `executeBatch(handlers, event)`: Execute multiple handlers
  - `getExecutionCount()`: Get execution count
  - `reset()`: Reset executor state

### Implementations

#### SubscriptionManager
- **Purpose**: Manage event subscriptions
- **Location**: `core/implementations/SubscriptionManager.ts`
- **Features**:
  - Priority-based handler ordering
  - Unique subscription tracking
  - Subscription statistics
  - Event type indexing
  - Concurrent subscription support

#### ErrorHandler
- **Purpose**: Handle errors during event processing
- **Location**: `core/implementations/ErrorHandler.ts`
- **Strategies**:
  - `CONTINUE`: Continue processing after error
  - `STOP`: Stop processing after error
  - `RETRY`: Retry failed handler
  - `IGNORE`: Ignore errors silently
- **Features**:
  - Error tracking and reporting
  - Error statistics
  - Custom error handlers
  - Error context capture

#### EventExecutor
- **Purpose**: Execute event handlers
- **Location**: `core/implementations/EventExecutor.ts`
- **Features**:
  - Synchronous execution
  - Asynchronous execution
  - Batch execution
  - Execution time tracking
  - Error propagation
  - Execution statistics

#### EventBus
- **Purpose**: Central event bus implementation
- **Location**: `core/implementations/EventBus.ts`
- **Features**:
  - Event subscription and unsubscription
  - Synchronous and asynchronous publishing
  - Priority-based handler execution
  - Statistics tracking
  - Integration with SubscriptionManager, ErrorHandler, EventExecutor
  - Event filtering
  - Error handling integration

## Design Principles

### Separation of Concerns
Each component has a single responsibility:
- SubscriptionManager: Subscription management
- ErrorHandler: Error handling
- EventExecutor: Handler execution
- EventBus: Orchestration

### Dependency Injection
Components accept dependencies through constructors, enabling easy testing and configuration.

### Interface-Based Design
All core components implement interfaces, allowing for alternative implementations.

### Error Resilience
Multiple error handling strategies provide flexibility for different use cases.

## Usage Examples

```typescript
import { EventBus } from './core';

// Create event bus
const eventBus = new EventBus();

// Subscribe to events
const handler = (event) => console.log('Event received:', event);
eventBus.subscribe('test.event', handler);

// Publish event synchronously
eventBus.publish(Event.create('test.event', { data: 'test' }));

// Publish event asynchronously
await eventBus.publishAsync(Event.create('test.event', { data: 'test' }));

// Get statistics
const stats = eventBus.getStatistics();
console.log('Total published:', stats.totalPublished);
console.log('Total subscriptions:', stats.totalSubscriptions);
```

## Integration with Other Layers

- **Domain Layer**: Uses Event entities from Domain Layer
- **Application Layer**: Used by EventDispatcher for event dispatching
- **Infrastructure Layer**: Can be extended with infrastructure implementations
- **Monitoring Layer**: Can integrate with metrics collection
- **Configuration Layer**: Can be configured via EventBusConfig

## Testing
Core Layer tests are located in `__tests__/core/`:
- `SubscriptionManager.test.ts`
- `ErrorHandler.test.ts`
- `EventExecutor.test.ts`
- `EventBus.test.ts`

All tests cover subscription lifecycle, error handling, execution modes, and edge cases.
