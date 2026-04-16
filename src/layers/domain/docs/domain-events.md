# Domain Events

## Overview
The Domain Layer implements domain events for event-driven architecture, supporting event publishing per aggregate, uncommitted event tracking, and timestamp tracking.

## Domain Event Structure

### Event Definition
```typescript
interface DomainEvent {
  id: string;
  aggregateId: string;
  eventType: string;
  eventData: any;
  timestamp: Date;
  version: number;
}
```

### Event Publisher
```typescript
class DomainEventPublisher {
  private events: Map<string, DomainEvent[]> = new Map();
  
  publish(aggregateId: string, event: DomainEvent): void {
    if (!this.events.has(aggregateId)) {
      this.events.set(aggregateId, []);
    }
    
    this.events.get(aggregateId)?.push(event);
  }
  
  getEvents(aggregateId: string): DomainEvent[] {
    return this.events.get(aggregateId) || [];
  }
  
  clearEvents(aggregateId: string): void {
    this.events.delete(aggregateId);
  }
  
  getAllEvents(): DomainEvent[] {
    const allEvents: DomainEvent[] = [];
    
    for (const events of this.events.values()) {
      allEvents.push(...events);
    }
    
    return allEvents;
  }
  
  clearAll(): void {
    this.events.clear();
  }
}
```

## Event Tracking

### Uncommitted Events
```typescript
class UncommittedEventManager {
  private uncommittedEvents: Map<string, DomainEvent[]> = new Map();
  
  addEvent(aggregateId: string, event: DomainEvent): void {
    if (!this.uncommittedEvents.has(aggregateId)) {
      this.uncommittedEvents.set(aggregateId, []);
    }
    
    this.uncommittedEvents.get(aggregateId)?.push(event);
  }
  
  getUncommittedEvents(aggregateId: string): DomainEvent[] {
    return this.uncommittedEvents.get(aggregateId) || [];
  }
  
  commitEvents(aggregateId: string): void {
    this.uncommittedEvents.delete(aggregateId);
  }
  
  markAsCommitted(eventId: string): void {
    for (const events of this.uncommittedEvents.values()) {
      const index = events.findIndex(e => e.id === eventId);
      if (index !== -1) {
        events.splice(index, 1);
        break;
      }
    }
  }
}
```

## Event Examples

### User Created Event
```typescript
class UserCreatedEvent implements DomainEvent {
  id: string;
  aggregateId: string;
  eventType = 'UserCreated';
  eventData: { userId: string; email: string; name: string };
  timestamp: Date;
  version: number;
  
  constructor(userId: string, email: string, name: string) {
    this.id = crypto.randomUUID();
    this.aggregateId = userId;
    this.eventData = { userId, email, name };
    this.timestamp = new Date();
    this.version = 1;
  }
}
```

### User Updated Event
```typescript
class UserUpdatedEvent implements DomainEvent {
  id: string;
  aggregateId: string;
  eventType = 'UserUpdated';
  eventData: { userId: string; changes: Map<string, any> };
  timestamp: Date;
  version: number;
  
  constructor(userId: string, changes: Map<string, any>) {
    this.id = crypto.randomUUID();
    this.aggregateId = userId;
    this.eventData = { userId, changes };
    this.timestamp = new Date();
    this.version = 1;
  }
}
```

### User Deleted Event
```typescript
class UserDeletedEvent implements DomainEvent {
  id: string;
  aggregateId: string;
  eventType = 'UserDeleted';
  eventData: { userId: string };
  timestamp: Date;
  version: number;
  
  constructor(userId: string) {
    this.id = crypto.randomUUID();
    this.aggregateId = userId;
    this.eventData = { userId };
    this.timestamp = new Date();
    this.version = 1;
  }
}
```

## Event Bus Integration

### Event Bus
```typescript
class DomainEventBus {
  private subscribers: Map<string, EventSubscriber[]> = new Map();
  
  subscribe(eventType: string, subscriber: EventSubscriber): void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    
    this.subscribers.get(eventType)?.push(subscriber);
  }
  
  unsubscribe(eventType: string, subscriber: EventSubscriber): void {
    const subscribers = this.subscribers.get(eventType);
    if (subscribers) {
      const index = subscribers.indexOf(subscriber);
      if (index !== -1) {
        subscribers.splice(index, 1);
      }
    }
  }
  
  async publish(event: DomainEvent): Promise<void> {
    const subscribers = this.subscribers.get(event.eventType) || [];
    
    for (const subscriber of subscribers) {
      await subscriber.handle(event);
    }
  }
}

interface EventSubscriber {
  handle(event: DomainEvent): Promise<void>;
}
```

## Event Storage

### Event Store
```typescript
class DomainEventStore {
  private events: DomainEvent[] = [];
  
  save(event: DomainEvent): void {
    this.events.push(event);
  }
  
  saveBatch(events: DomainEvent[]): void {
    this.events.push(...events);
  }
  
  getEvents(aggregateId: string): DomainEvent[] {
    return this.events.filter(e => e.aggregateId === aggregateId);
  }
  
  getEventsByType(eventType: string): DomainEvent[] {
    return this.events.filter(e => e.eventType === eventType);
  }
  
  getEventsAfter(aggregateId: string, version: number): DomainEvent[] {
    return this.events.filter(
      e => e.aggregateId === aggregateId && e.version > version
    );
  }
  
  clear(): void {
    this.events = [];
  }
}
```

## Event Serialization

### Event Serializer
```typescript
class EventSerializer {
  serialize(event: DomainEvent): string {
    return JSON.stringify({
      id: event.id,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      eventData: event.eventData,
      timestamp: event.timestamp.toISOString(),
      version: event.version
    });
  }
  
  deserialize(json: string): DomainEvent {
    const data = JSON.parse(json);
    
    return {
      id: data.id,
      aggregateId: data.aggregateId,
      eventType: data.eventType,
      eventData: data.eventData,
      timestamp: new Date(data.timestamp),
      version: data.version
    };
  }
}
```

## Best Practices

### Event Design Guidelines
- Use descriptive event names
- Include aggregate ID in events
- Include timestamp for audit trail
- Include event version for evolution
- Keep event data minimal

### Event Publishing Guidelines
- Publish events after state changes
- Use transaction boundaries
- Handle event publishing failures
- Implement event replay capability
- Use event sourcing for audit trails

### Performance Considerations
- Batch event publishing
- Use async event handlers
- Implement event caching
- Use efficient serialization
