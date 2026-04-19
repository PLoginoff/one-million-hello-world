# Domain Layer Documentation

## Overview
The Domain Layer is the heart of the Event Layer architecture. It contains core business entities and value objects that represent the domain model of events. This layer has zero dependencies on other layers, ensuring that business rules are encapsulated and independent of infrastructure concerns.

## Components

### Value Objects

#### EventId
- **Purpose**: Unique identifier for events
- **Location**: `domain/value-objects/EventId.ts`
- **Features**:
  - Generates unique IDs by default
  - Accepts custom ID values
  - Validates ID format (minimum 10 characters)
  - Provides equality comparison
  - Supports serialization to string

#### EventType
- **Purpose**: Categorization of events
- **Location**: `domain/value-objects/EventType.ts`
- **Features**:
  - Validates event type format (lowercase, dots, hyphens)
  - Extracts category from event type
  - Extracts subcategory from event type
  - Pattern matching with wildcards
  - Category-based filtering

#### EventMetadata
- **Purpose**: Contextual information for events
- **Location**: `domain/value-objects/EventMetadata.ts`
- **Features**:
  - Timestamp management
  - Source tracking
  - Correlation ID for event chains
  - Causation ID for event causality
  - User ID association
  - Version tracking
  - Tag system for custom metadata
  - Metadata immutability (withCausationId, withTag)

#### EventPayload
- **Purpose**: Event data encapsulation
- **Location**: `domain/value-objects/EventPayload.ts`
- **Features**:
  - Data validation (cannot be undefined)
  - Size calculation
  - Path-based data access
  - Schema support
  - Content type management
  - Empty payload detection

### Entities

#### Event
- **Purpose**: Core domain entity representing an event
- **Location**: `domain/entities/Event.ts`
- **Features**:
  - Composes all value objects (EventId, EventType, EventPayload, EventMetadata)
  - Implements IDomainEvent interface
  - Temporal ordering (occurredBefore, occurredAfter)
  - Correlation tracking (isCorrelatedWith)
  - Event transformation (withPayload, withMetadata)
  - Causality management (withCausationId)
  - Serialization support (toPrimitive, toJSON, toString)

### Interfaces

#### IDomainEvent
- **Purpose**: Base interface for all domain events
- **Location**: `domain/interfaces/IDomainEvent.ts`
- **Features**:
  - Defines event contract
  - Ensures all events have required properties
  - Type safety for event implementations

## Design Principles

### Immutability
All value objects are immutable. Modifications create new instances with updated values.

### Validation
All value objects validate their inputs and throw errors for invalid data.

### Domain-Driven Design
The layer follows DDD principles with rich domain model and value objects.

### Zero Dependencies
The Domain Layer has no dependencies on other layers, ensuring business logic independence.

## Usage Examples

```typescript
import { Event, EventBuilder } from './domain';

// Creating an event using builder
const event = EventBuilder.create()
  .withType('user.created')
  .withPayload({ userId: '123', name: 'John' })
  .withSource('api')
  .withCorrelationId('corr-123')
  .withUserId('user-123')
  .withTag('region', 'us-east')
  .build();

// Creating a simple event
const simpleEvent = Event.create('test.event', { data: 'test' });

// Checking correlation
const event1 = Event.create('test.event', {});
const event2 = event1.withCausationId('cause-1');
console.log(event1.isCorrelatedWith(event2)); // true
```

## Testing
Domain Layer tests are located in `__tests__/domain/`:
- `EventId.test.ts`
- `EventType.test.ts`
- `EventMetadata.test.ts`
- `EventPayload.test.ts`
- `Event.test.ts`

All tests cover validation, equality, serialization, and edge cases.
