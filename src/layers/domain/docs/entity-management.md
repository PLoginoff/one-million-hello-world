# Entity Management

## Overview
The Domain Layer provides entity management capabilities including create, update, delete operations, validation, and timestamp tracking.

## Entity Structure

### Entity Definition
```typescript
interface Entity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface EntityValidator {
  validate(entity: Entity): ValidationResult;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

### Entity Manager
```typescript
class EntityManager {
  private entities: Map<string, Entity> = new Map();
  private validator: EntityValidator;
  
  constructor(validator: EntityValidator) {
    this.validator = validator;
  }
  
  create(entity: Entity): Entity {
    const validation = this.validator.validate(entity);
    if (!validation.valid) {
      throw new ValidationError(validation.errors);
    }
    
    entity.createdAt = new Date();
    entity.updatedAt = new Date();
    entity.version = 1;
    
    this.entities.set(entity.id, entity);
    return entity;
  }
  
  update(id: string, updates: Partial<Entity>): Entity {
    const entity = this.entities.get(id);
    if (!entity) {
      throw new NotFoundError(`Entity with id ${id} not found`);
    }
    
    const updated = { ...entity, ...updates, updatedAt: new Date(), version: entity.version + 1 };
    
    const validation = this.validator.validate(updated);
    if (!validation.valid) {
      throw new ValidationError(validation.errors);
    }
    
    this.entities.set(id, updated);
    return updated;
  }
  
  delete(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) {
      throw new NotFoundError(`Entity with id ${id} not found`);
    }
    
    this.entities.delete(id);
  }
  
  findById(id: string): Entity | undefined {
    return this.entities.get(id);
  }
  
  findAll(): Entity[] {
    return Array.from(this.entities.values());
  }
  
  clear(): void {
    this.entities.clear();
  }
}
```

## Entity Validation

### Validator Implementation
```typescript
class BaseEntityValidator implements EntityValidator {
  validate(entity: Entity): ValidationResult {
    const errors: string[] = [];
    
    if (!entity.id) {
      errors.push('Entity ID is required');
    }
    
    if (!entity.createdAt) {
      errors.push('Created timestamp is required');
    }
    
    if (!entity.updatedAt) {
      errors.push('Updated timestamp is required');
    }
    
    if (entity.version < 0) {
      errors.push('Version must be non-negative');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

class CustomEntityValidator implements EntityValidator {
  constructor(private customRules: ValidationRule[]) {}
  
  validate(entity: Entity): ValidationResult {
    const baseValidator = new BaseEntityValidator();
    const baseValidation = baseValidator.validate(entity);
    
    if (!baseValidation.valid) {
      return baseValidation;
    }
    
    const errors: string[] = [];
    
    for (const rule of this.customRules) {
      const result = rule.validate(entity);
      if (!result.valid) {
        errors.push(...result.errors);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

interface ValidationRule {
  validate(entity: Entity): ValidationResult;
}
```

## Timestamp Tracking

### Timestamp Manager
```typescript
class TimestampManager {
  updateTimestamp(entity: Entity): Entity {
    entity.updatedAt = new Date();
    return entity;
  }
  
  setCreationTimestamp(entity: Entity): Entity {
    entity.createdAt = new Date();
    entity.updatedAt = new Date();
    return entity;
  }
  
  validateTimestamps(entity: Entity): ValidationResult {
    const errors: string[] = [];
    
    if (entity.createdAt > entity.updatedAt) {
      errors.push('Created timestamp cannot be after updated timestamp');
    }
    
    if (entity.createdAt > new Date()) {
      errors.push('Created timestamp cannot be in the future');
    }
    
    if (entity.updatedAt > new Date()) {
      errors.push('Updated timestamp cannot be in the future');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## Version Tracking

### Version Manager
```typescript
class VersionManager {
  incrementVersion(entity: Entity): Entity {
    entity.version = entity.version + 1;
    return entity;
  }
  
  validateVersion(entity: Entity, expectedVersion: number): boolean {
    return entity.version === expectedVersion;
  }
  
  checkOptimisticLock(entity: Entity, expectedVersion: number): void {
    if (!this.validateVersion(entity, expectedVersion)) {
      throw new OptimisticLockError('Entity has been modified by another process');
    }
  }
}
```

## Entity Storage

### In-Memory Storage
```typescript
class EntityStorage {
  private storage: Map<string, Entity> = new Map();
  
  save(entity: Entity): void {
    this.storage.set(entity.id, entity);
  }
  
  load(id: string): Entity | undefined {
    return this.storage.get(id);
  }
  
  remove(id: string): void {
    this.storage.delete(id);
  }
  
  exists(id: string): boolean {
    return this.storage.has(id);
  }
  
  count(): number {
    return this.storage.size;
  }
  
  clear(): void {
    this.storage.clear();
  }
}
```

## Entity Lifecycle

### Lifecycle Manager
```typescript
class EntityLifecycleManager {
  private hooks: Map<string, LifecycleHook[]> = new Map();
  
  registerHook(event: LifecycleEvent, hook: LifecycleHook): void {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event)?.push(hook);
  }
  
  async executeHooks(event: LifecycleEvent, entity: Entity): Promise<void> {
    const hooks = this.hooks.get(event) || [];
    
    for (const hook of hooks) {
      await hook.execute(entity);
    }
  }
}

enum LifecycleEvent {
  BEFORE_CREATE = 'beforeCreate',
  AFTER_CREATE = 'afterCreate',
  BEFORE_UPDATE = 'beforeUpdate',
  AFTER_UPDATE = 'afterUpdate',
  BEFORE_DELETE = 'beforeDelete',
  AFTER_DELETE = 'afterDelete'
}

interface LifecycleHook {
  execute(entity: Entity): Promise<void>;
}
```

## Best Practices

### Entity Design Guidelines
- Use unique identifiers for entities
- Implement proper validation
- Track timestamps for audit trail
- Use versioning for optimistic locking
- Implement lifecycle hooks for cross-cutting concerns

### Validation Guidelines
- Validate all required fields
- Validate data types and formats
- Validate business rules
- Provide clear error messages
- Validate timestamps

### Performance Considerations
- Use efficient data structures for storage
- Implement entity caching
- Use connection pooling for persistence
- Batch operations when possible
