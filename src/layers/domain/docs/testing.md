# Testing Strategy

## Overview
The Domain Layer follows a comprehensive testing strategy to ensure correctness, immutability, and event handling of domain functionality. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IDomainManager Interface**: 100% (type validation)
- **DomainManager Implementation**: 99%+
- **Entity Manager**: 99%+
- **Value Objects**: 99%+
- **Domain Events**: 99%+
- **Aggregate Roots**: 99%+

## Unit Tests

### Test Organization
```
src/layers/domain/__tests__/
├── unit/
│   ├── entities/
│   │   ├── entity-manager.test.ts
│   │   ├── entity-validator.test.ts
│   │   ├── timestamp-manager.test.ts
│   │   └── lifecycle-manager.test.ts
│   ├── value-objects/
│   │   ├── email.test.ts
│   │   ├── money.test.ts
│   │   ├── percentage.test.ts
│   │   ├── url.test.ts
│   │   └── uuid.test.ts
│   ├── events/
│   │   ├── event-publisher.test.ts
│   │   ├── event-bus.test.ts
│   │   └── event-store.test.ts
│   ├── aggregates/
│   │   ├── aggregate-root.test.ts
│   │   ├── version-manager.test.ts
│   │   └── aggregate-repository.test.ts
│   └── domain-manager.test.ts
```

### Unit Test Categories

#### 1. Entity Manager Tests
```typescript
describe('Entity Manager', () => {
  it('should create entity', () => {
    const validator = new BaseEntityValidator();
    const manager = new EntityManager(validator);
    const entity = createTestEntity();
    
    const created = manager.create(entity);
    
    expect(created.id).toBe(entity.id);
    expect(created.createdAt).toBeDefined();
    expect(created.version).toBe(1);
  });

  it('should update entity', () => {
    const validator = new BaseEntityValidator();
    const manager = new EntityManager(validator);
    const entity = createTestEntity();
    
    manager.create(entity);
    const updated = manager.update(entity.id, { name: 'Updated' });
    
    expect(updated.name).toBe('Updated');
    expect(updated.version).toBe(2);
  });

  it('should delete entity', () => {
    const validator = new BaseEntityValidator();
    const manager = new EntityManager(validator);
    const entity = createTestEntity();
    
    manager.create(entity);
    manager.delete(entity.id);
    
    expect(manager.findById(entity.id)).toBeUndefined();
  });
});
```

#### 2. Value Object Tests
```typescript
describe('Email Value Object', () => {
  it('should create valid email', () => {
    const email = new Email('test@example.com');
    
    expect(email.getValue()).toBe('test@example.com');
  });

  it('should reject invalid email', () => {
    expect(() => new Email('invalid')).toThrow(InvalidValueError);
  });

  it('should compare equality by value', () => {
    const email1 = new Email('test@example.com');
    const email2 = new Email('test@example.com');
    
    expect(email1.equals(email2)).toBe(true);
  });
});

describe('Money Value Object', () => {
  it('should create valid money', () => {
    const money = new Money(100, 'USD');
    
    expect(money.getAmount()).toBe(100);
    expect(money.getCurrency()).toBe('USD');
  });

  it('should reject negative amount', () => {
    expect(() => new Money(-100, 'USD')).toThrow(InvalidValueError);
  });

  it('should add money of same currency', () => {
    const money1 = new Money(100, 'USD');
    const money2 = new Money(50, 'USD');
    
    const result = money1.add(money2);
    
    expect(result.getAmount()).toBe(150);
  });

  it('should reject adding different currencies', () => {
    const money1 = new Money(100, 'USD');
    const money2 = new Money(50, 'EUR');
    
    expect(() => money1.add(money2)).toThrow(CurrencyMismatchError);
  });
});
```

#### 3. Domain Event Tests
```typescript
describe('Domain Event Publisher', () => {
  it('should publish event for aggregate', () => {
    const publisher = new DomainEventPublisher();
    const event = createTestEvent('aggregate-123');
    
    publisher.publish('aggregate-123', event);
    
    const events = publisher.getEvents('aggregate-123');
    expect(events).toHaveLength(1);
    expect(events[0]).toBe(event);
  });

  it('should clear events for aggregate', () => {
    const publisher = new DomainEventPublisher();
    const event = createTestEvent('aggregate-123');
    
    publisher.publish('aggregate-123', event);
    publisher.clearEvents('aggregate-123');
    
    const events = publisher.getEvents('aggregate-123');
    expect(events).toHaveLength(0);
  });
});
```

#### 4. Aggregate Root Tests
```typescript
describe('User Aggregate', () => {
  it('should create user aggregate', () => {
    const user = new UserAggregate('user-123', 'test@example.com', 'Test User', 'password');
    
    expect(user.getId()).toBe('user-123');
    expect(user.getEmail()).toBe('test@example.com');
    expect(user.getName()).toBe('Test User');
  });

  it('should update name and generate event', () => {
    const user = new UserAggregate('user-123', 'test@example.com', 'Test User', 'password');
    
    user.updateName('Updated Name');
    
    expect(user.getName()).toBe('Updated Name');
    expect(user.uncommittedEvents).toHaveLength(2); // Created + Updated
  });

  it('should mark events as committed', () => {
    const user = new UserAggregate('user-123', 'test@example.com', 'Test User', 'password');
    
    user.markEventsAsCommitted();
    
    expect(user.uncommittedEvents).toHaveLength(0);
  });
});
```

## Integration Tests

### Full Domain Integration Tests
```typescript
describe('Domain Integration', () => {
  it('should create and save aggregate with events', async () => {
    const eventStore = new DomainEventStore();
    const repository = new UserAggregateRepository(eventStore);
    const user = new UserAggregate('user-123', 'test@example.com', 'Test User', 'password');
    
    await repository.save(user);
    
    const saved = await repository.findById('user-123');
    expect(saved).not.toBeNull();
    expect(saved?.getEmail()).toBe('test@example.com');
  });

  it('should load aggregate from event history', async () => {
    const eventStore = new DomainEventStore();
    const repository = new UserAggregateRepository(eventStore);
    
    const createdEvent = new UserCreatedEvent('user-123', 'test@example.com', 'Test User');
    eventStore.save(createdEvent);
    
    const user = await repository.loadFromHistory('user-123');
    
    expect(user.getEmail()).toBe('test@example.com');
    expect(user.getName()).toBe('Test User');
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should create entity within time limit', () => {
    const validator = new BaseEntityValidator();
    const manager = new EntityManager(validator);
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      const entity = createTestEntity(`id-${i}`);
      manager.create(entity);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 1000 entities
  });

  it('should compare value objects efficiently', () => {
    const email1 = new Email('test@example.com');
    const email2 = new Email('test@example.com');
    const start = Date.now();
    
    for (let i = 0; i < 10000; i++) {
      email1.equals(email2);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(50); // < 50ms for 10000 comparisons
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createTestEntity(id?: string): Entity {
  return {
    id: id || 'test-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1
  };
}

function createTestEvent(aggregateId: string): DomainEvent {
  return {
    id: crypto.randomUUID(),
    aggregateId,
    eventType: 'TestEvent',
    eventData: {},
    timestamp: new Date(),
    version: 1
  };
}

class UserAggregateRepository extends AggregateRepository<UserAggregate> {
  protected createAggregate(id: string): UserAggregate {
    return new UserAggregate(id, 'test@example.com', 'Test User', 'password');
  }
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/domain
```

### Integration Tests
```bash
npm run test:integration -- src/layers/domain
```

### Performance Tests
```bash
npm run test:performance -- src/layers/domain
```

### All Tests
```bash
npm test -- src/layers/domain
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/domain
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Domain Tests

on:
  pull_request:
    paths:
      - 'src/layers/domain/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/domain
      - run: npm run test:integration -- src/layers/domain
      - run: npm run test:performance -- src/layers/domain
      - run: npm run test:coverage -- src/layers/domain
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all entity operations
- Test value object immutability
- Test event publishing and handling
- Test aggregate lifecycle
- Test validation rules
- Maintain test independence

### Value Object Testing Guidelines
- Test immutability
- Test equality comparison
- Test validation logic
- Test value object composition
- Test hash code generation

### Event Testing Guidelines
- Test event creation
- Test event publishing
- Test event storage
- Test event replay
- Test event serialization
