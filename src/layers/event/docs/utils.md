# Utils Layer Documentation

## Overview
The Utils Layer provides utility classes for common event-related operations. This layer contains reusable components that support event validation, serialization, ID generation, and event construction.

## Components

### EventValidator

- **Purpose**: Validate event structure and content
- **Location**: `utils/EventValidator.ts`
- **Features**:
  - Validates event structure (id, type, payload, metadata)
  - Validates correlation ID presence
  - Validates timestamp (cannot be in future)
  - Custom validation rules
  - Batch validation
  - Validation result with errors and warnings

**Usage Example**:
```typescript
import { EventValidator } from './utils';
import { Event } from './domain';

const validator = new EventValidator();
const event = Event.create('test.event', { data: 'test' });

const result = validator.validate(event);
console.log(result.valid); // true
console.log(result.errors); // []
```

**Custom Rules**:
```typescript
const customRule = {
  name: 'userId-required',
  validate: (event) => {
    return event.payload.data.userId !== undefined;
  },
  defaultMessage: 'userId is required in payload',
};

validator.addRule(customRule);
```

### EventSerializer

- **Purpose**: Serialize and deserialize events
- **Location**: `utils/EventSerializer.ts`
- **Features**:
  - JSON serialization
  - Protocol Buffers support (future)
  - MessagePack support (future)
  - Batch serialization
  - Round-trip conversion
  - Format selection

**Usage Example**:
```typescript
import { EventSerializer } from './utils';
import { Event } from './domain';

const serializer = new EventSerializer('json');
const event = Event.create('test.event', { data: 'test' });

// Serialize
const serialized = serializer.serialize(event);
console.log(serialized); // JSON string

// Deserialize
const deserialized = serializer.deserialize(serialized);
console.log(deserialized.id.value); // Original ID

// Batch
const events = [event1, event2, event3];
const serializedBatch = serializer.serializeBatch(events);
const deserializedBatch = serializer.deserializeBatch(serializedBatch);
```

### IdGenerator

- **Purpose**: Generate unique identifiers
- **Location**: `utils/IdGenerator.ts`
- **Features**:
  - UUID generation (v4)
  - NanoID generation
  - ULID generation
  - Custom generation strategies
  - Prefix and suffix support
  - Batch generation

**Usage Example**:
```typescript
import { IdGenerator } from './utils';

// Default UUID
const generator = new IdGenerator();
const id = generator.generate();
console.log(id); // UUID v4

// NanoID
const nanoGenerator = new IdGenerator({ strategy: 'nanoid' });
const nanoId = nanoGenerator.generate();

// ULID
const ulidGenerator = new IdGenerator({ strategy: 'ulid' });
const ulid = ulidGenerator.generate();

// With prefix and suffix
const customGenerator = new IdGenerator({
  strategy: 'nanoid',
  prefix: 'event-',
  suffix: '-v1',
});
const customId = customGenerator.generate();
console.log(customId); // event-<nanoid>-v1

// Batch
const ids = generator.generateBatch(10);
```

### EventBuilder

- **Purpose**: Fluent API for event construction
- **Location**: `utils/EventBuilder.ts`
- **Features**:
  - Fluent builder pattern
  - Method chaining
  - Event creation from scratch
  - Event modification from existing
  - Metadata management
  - Tag management
  - Causality tracking

**Usage Example**:
```typescript
import { EventBuilder } from './utils';

// Simple event
const event = EventBuilder.create()
  .withType('test.event')
  .withPayload({ data: 'test' })
  .build();

// Complex event
const complexEvent = EventBuilder.create()
  .withId('custom-id')
  .withType('user.created')
  .withPayload({ userId: '123', name: 'John' })
  .withSource('api')
  .withCorrelationId('corr-123')
  .withUserId('user-123')
  .withTag('region', 'us-east')
  .withTag('version', 'v1')
  .withCausationId('cause-456')
  .withOccurredAt(new Date('2024-01-01'))
  .build();

// Modify existing event
const modified = EventBuilder.fromEvent(event)
  .withPayload({ new: 'data' })
  .build();
```

## Design Principles

### Reusability
Utility classes are designed to be reused across multiple layers.

### Flexibility
All utilities support multiple strategies and configurations.

### Immutability
EventBuilder creates new events rather than modifying existing ones.

### Type Safety
All utilities are fully typed for TypeScript.

## Integration with Other Layers

- **Domain Layer**: Used to create and validate Event entities
- **Core Layer**: Used by EventBus for event generation
- **Application Layer**: Used by EventDispatcher for event construction
- **Infrastructure Layer**: Used for serialization before storage
- **Testing Layer**: Used in test factories and helpers

## Testing
Utils Layer tests are located in `__tests__/utils/`:
- `EventValidator.test.ts`
- `EventSerializer.test.ts`
- `IdGenerator.test.ts`
- `EventBuilder.test.ts`

All tests cover validation rules, serialization formats, ID generation strategies, and builder patterns.
