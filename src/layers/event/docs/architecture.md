# Event Layer Architecture

## Status
Accepted (Refactored)

## Context
The Event Layer is responsible for event bus, Pub/Sub, and domain event propagation. It receives requests from the Cache Layer and provides event-driven communication capabilities.

## Decision
We chose to implement the Event Layer with a comprehensive 8-layer architecture following clean architecture principles and domain-driven design:

### Layer Overview

#### 1. Domain Layer
The heart of the system containing core business entities and value objects.

**Components:**
- `Event` - Domain entity representing an event
- `EventId` - Value object for unique event identification
- `EventType` - Value object for event type categorization
- `EventMetadata` - Value object for event metadata (timestamp, correlation, etc.)
- `EventPayload` - Value object for event data payload
- `IDomainEvent` - Interface for all domain events

**Responsibilities:**
- Define domain model
- Enforce business rules
- Provide immutability
- Value object validation

#### 2. Core Layer
Core business logic and event bus implementation.

**Interfaces:**
- `IEventBus` - Main event bus contract
- `ISubscriptionManager` - Subscription lifecycle management
- `IErrorHandler` - Error handling strategies
- `IEventExecutor` - Event handler execution

**Implementations:**
- `EventBus` - Main event bus implementation
- `SubscriptionManager` - Subscription storage and retrieval
- `ErrorHandler` - Error capture and handling
- `EventExecutor` - Synchronous and async execution

**Responsibilities:**
- Event publishing and subscription
- Subscription lifecycle
- Error handling
- Handler execution

#### 3. Infrastructure Layer
External concerns and persistence mechanisms.

**Interfaces:**
- `IEventStore` - Event persistence and retrieval
- `IEventPublisher` - External event publishing
- `IEventSubscriber` - External event subscription
- `IEventQueue` - Event queue management

**Implementations:**
- `MemoryEventStore` - In-memory event storage
- `ConsoleEventPublisher` - Console-based publishing
- `MemoryEventQueue` - In-memory queue implementation

**Responsibilities:**
- Event persistence
- External system integration
- Queue management
- Storage abstraction

#### 4. Application Layer
Application-specific services and coordination.

**Interfaces:**
- `IEventHandlerRegistry` - Handler registration and discovery
- `IEventDispatcher` - Event dispatching with middleware

**Services:**
- `EventHandlerRegistry` - Priority-based handler registration
- `EventDispatcher` - Middleware-enabled dispatching

**Responsibilities:**
- Handler registration
- Event dispatching
- Middleware pipeline
- Retry policies

#### 5. Utils Layer
Utility classes for common operations.

**Components:**
- `EventValidator` - Event validation with custom rules
- `EventSerializer` - Event serialization (JSON, protobuf, msgpack)
- `IdGenerator` - ID generation strategies (UUID, nanoID, ULID)
- `EventBuilder` - Fluent API for event construction

**Responsibilities:**
- Validation
- Serialization
- ID generation
- Builder pattern

#### 6. Monitoring Layer
Observability and logging capabilities.

**Interfaces:**
- `IEventMetrics` - Metrics collection interface

**Components:**
- `EventMetricsCollector` - Metrics aggregation and time-series
- `EventLogger` - Structured logging with levels

**Responsibilities:**
- Metrics collection
- Performance tracking
- Error monitoring
- Audit logging

#### 7. Configuration Layer
Configuration management and validation.

**Components:**
- `EventBusConfig` - Type-safe configuration
- `ConfigValidator` - Configuration validation
- `ConfigLoader` - Multi-source configuration loading

**Responsibilities:**
- Configuration definition
- Validation
- Environment variable loading
- Default values

#### 8. Testing Layer
Testing utilities and mocks.

**Components:**
- `MockEventBus` - Mock implementation for testing
- `TestEventFactory` - Test data generation
- `EventTestHelpers` - Assertion and utility helpers

**Responsibilities:**
- Test doubles
- Test data generation
- Assertion helpers
- Test utilities

### Key Design Decisions

**Clean Architecture**
- Domain layer independent of all other layers
- Core layer depends only on domain
- Infrastructure implements core interfaces
- Application orchestrates core and infrastructure

**Domain-Driven Design**
- Rich domain model with value objects
- Domain events as first-class citizens
- Business rules in domain layer
- Immutable entities

**Dependency Inversion**
- High-level modules don't depend on low-level modules
- Both depend on abstractions (interfaces)
- Implementations depend on interfaces

**Single Responsibility**
- Each layer has one clear purpose
- Each class has one reason to change
- Clear separation of concerns

**Open/Closed Principle**
- Open for extension via interfaces
- Closed for modification of core logic
- Plugin architecture for handlers

**Interface Segregation**
- Focused, cohesive interfaces
- Clients depend only on used methods
- No fat interfaces

**Dependency Injection**
- Constructor injection for dependencies
- Configurable component assembly
- Testable by design

### Isolation Strategy
- Domain Layer: Zero dependencies
- Core Layer: Depends only on Domain
- Infrastructure: Implements Core interfaces
- Application: Orchestrates Core and Infrastructure
- Utils: Standalone utilities
- Monitoring: Observability without side effects
- Configuration: External configuration only
- Testing: Test-specific utilities

## Consequences

### Positive
- Clean separation of concerns
- Testable architecture
- Flexible and extensible
- Domain-driven design
- Strong typing
- Comprehensive observability
- Easy to maintain
- Plugin-friendly

### Negative
- Increased complexity
- More files and layers
- Steeper learning curve
- Potential over-engineering
- More indirection
- Higher initial development cost

### Alternatives Considered
1. **Single-layer monolith**: Rejected for lack of separation
2. **3-layer architecture**: Rejected as insufficient
3. **EventEmitter**: Rejected for lack of control
4. **Direct function calls**: Rejected for tight coupling
5. **No domain layer**: Rejected for lack of DDD

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- domain/ - Domain layer documentation
- core/ - Core layer documentation
- infrastructure/ - Infrastructure layer documentation
- application/ - Application layer documentation
- utils/ - Utils layer documentation
- monitoring/ - Monitoring layer documentation
- configuration/ - Configuration layer documentation
- testing/ - Testing layer documentation
