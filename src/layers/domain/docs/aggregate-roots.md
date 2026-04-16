# Aggregate Roots

## Overview
The Domain Layer implements aggregate roots for managing entity lifecycle, version tracking, and uncommitted event management.

## Aggregate Root Structure

### Aggregate Root Definition
```typescript
interface AggregateRoot extends Entity {
  version: number;
  uncommittedEvents: DomainEvent[];
  markEventsAsCommitted(): void;
  loadFromHistory(events: DomainEvent[]): void;
}
```

### Base Aggregate Root
```typescript
abstract class BaseAggregateRoot implements AggregateRoot {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  uncommittedEvents: DomainEvent[] = [];
  
  constructor(id: string) {
    this.id = id;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.version = 0;
  }
  
  protected addEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event);
    this.version++;
  }
  
  markEventsAsCommitted(): void {
    this.uncommittedEvents = [];
  }
  
  loadFromHistory(events: DomainEvent[]): void {
    for (const event of events) {
      this.applyEvent(event);
      this.version = event.version;
    }
  }
  
  protected abstract applyEvent(event: DomainEvent): void;
}
```

## Aggregate Root Example

### User Aggregate Root
```typescript
class UserAggregate extends BaseAggregateRoot {
  private email: string;
  private name: string;
  private password: string;
  private active: boolean = true;
  
  constructor(id: string, email: string, name: string, password: string) {
    super(id);
    this.email = email;
    this.name = name;
    this.password = password;
    
    this.addEvent(new UserCreatedEvent(id, email, name));
  }
  
  updateName(name: string): void {
    this.name = name;
    this.updatedAt = new Date();
    
    const changes = new Map<string, any>();
    changes.set('name', name);
    
    this.addEvent(new UserUpdatedEvent(this.id, changes));
  }
  
  updateEmail(email: string): void {
    this.email = email;
    this.updatedAt = new Date();
    
    const changes = new Map<string, any>();
    changes.set('email', email);
    
    this.addEvent(new UserUpdatedEvent(this.id, changes));
  }
  
  deactivate(): void {
    this.active = false;
    this.updatedAt = new Date();
    
    this.addEvent(new UserDeletedEvent(this.id));
  }
  
  protected applyEvent(event: DomainEvent): void {
    switch (event.eventType) {
      case 'UserCreated':
        this.applyUserCreated(event as UserCreatedEvent);
        break;
      case 'UserUpdated':
        this.applyUserUpdated(event as UserUpdatedEvent);
        break;
      case 'UserDeleted':
        this.applyUserDeleted(event as UserDeletedEvent);
        break;
    }
  }
  
  private applyUserCreated(event: UserCreatedEvent): void {
    this.email = event.eventData.email;
    this.name = event.eventData.name;
  }
  
  private applyUserUpdated(event: UserUpdatedEvent): void {
    for (const [key, value] of event.eventData.changes) {
      if (key === 'email') this.email = value;
      if (key === 'name') this.name = value;
    }
  }
  
  private applyUserDeleted(event: UserDeletedEvent): void {
    this.active = false;
  }
  
  getEmail(): string {
    return this.email;
  }
  
  getName(): string {
    return this.name;
  }
  
  isActive(): boolean {
    return this.active;
  }
}
```

## Version Tracking

### Version Manager for Aggregates
```typescript
class AggregateVersionManager {
  incrementVersion(aggregate: AggregateRoot): void {
    aggregate.version++;
  }
  
  validateVersion(aggregate: AggregateRoot, expectedVersion: number): boolean {
    return aggregate.version === expectedVersion;
  }
  
  checkOptimisticLock(aggregate: AggregateRoot, expectedVersion: number): void {
    if (!this.validateVersion(aggregate, expectedVersion)) {
      throw new OptimisticLockError('Aggregate has been modified by another process');
    }
  }
}
```

## Event Commitment

### Event Commitment Manager
```typescript
class EventCommitmentManager {
  commitEvents(aggregate: AggregateRoot): void {
    aggregate.markEventsAsCommitted();
  }
  
  getUncommittedEvents(aggregate: AggregateRoot): DomainEvent[] {
    return aggregate.uncommittedEvents;
  }
  
  hasUncommittedEvents(aggregate: AggregateRoot): boolean {
    return aggregate.uncommittedEvents.length > 0;
  }
}
```

## Aggregate Repository

### Aggregate Repository Interface
```typescript
interface IAggregateRepository<T extends AggregateRoot> {
  save(aggregate: T): Promise<void>;
  findById(id: string): Promise<T | null>;
  loadFromHistory(id: string): Promise<T>;
}
```

### Aggregate Repository Implementation
```typescript
class AggregateRepository<T extends AggregateRoot> implements IAggregateRepository<T> {
  private storage: Map<string, T> = new Map();
  private eventStore: DomainEventStore;
  
  constructor(eventStore: DomainEventStore) {
    this.eventStore = eventStore;
  }
  
  async save(aggregate: T): Promise<void> {
    // Save events to event store
    for (const event of aggregate.uncommittedEvents) {
      this.eventStore.save(event);
    }
    
    // Mark events as committed
    aggregate.markEventsAsCommitted();
    
    // Save aggregate
    this.storage.set(aggregate.id, aggregate);
  }
  
  async findById(id: string): Promise<T | null> {
    return this.storage.get(id) || null;
  }
  
  async loadFromHistory(id: string): Promise<T> {
    const events = this.eventStore.getEvents(id);
    
    // Create new aggregate instance
    const aggregate = this.createAggregate(id);
    
    // Load from history
    aggregate.loadFromHistory(events);
    
    return aggregate;
  }
  
  protected abstract createAggregate(id: string): T;
}
```

## Best Practices

### Aggregate Root Design Guidelines
- Define clear aggregate boundaries
- Keep aggregates small and focused
- Use events for state changes
- Implement proper version tracking
- Mark events as committed after persistence

### Event Handling Guidelines
- Apply events in order
- Validate events before application
- Use event sourcing for audit trails
- Implement event replay capability
- Handle event versioning

### Performance Considerations
- Use event batching
- Implement event caching
- Use efficient serialization
- Minimize event data size
