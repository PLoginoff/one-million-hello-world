# Repository Handler Documentation

## Overview
The Repository Handler encapsulates business logic for repository operations with support for validation, metrics, and middleware chains.

## Architecture

### Components
1. **IRepositoryHandler Interface**: Defines the contract for handler operations
2. **RepositoryHandler Implementation**: Concrete handler with validation and metrics
3. **Handler Types**: Type definitions for operations, middleware, and validation

### Key Features

**Operation Handling**
- Find, FindById, Save, Delete, Count, Exists operations
- Async execution with error handling
- Context propagation

**Validation**
- Configurable validation rules
- Pre-operation validation
- Custom field validators

**Metrics**
- Execution time tracking
- Cache hit monitoring
- Transaction usage tracking

**Middleware**
- Operation-specific middleware chains
- Pre/post operation hooks
- Extensible middleware system

**Configuration**
- Enable/disable metrics
- Validation toggle
- Caching control
- Transaction support
- Retry configuration

## Usage Example

```typescript
import { RepositoryHandler } from './implementations/RepositoryHandler';
import { RepositoryOperation } from './types/handler-types';

const handler = new RepositoryHandler(repository, {
  enableMetrics: true,
  enableValidation: true,
  maxRetries: 3
});

// Add validation rule
handler.addValidationRule({
  field: 'email',
  validator: (value) => typeof value === 'string' && value.includes('@'),
  errorMessage: 'Invalid email format'
});

// Add middleware
handler.addMiddleware(RepositoryOperation.SAVE, async (op, next) => {
  console.log(`Before ${op}`);
  await next();
  console.log(`After ${op}`);
});

// Handle operation
const result = await handler.handleSave(entity);
```

## API Reference

### IRepositoryHandler Methods

**Operations**
- `handleFind(options?, context?)`: Find entities
- `handleFindById(id, context?)`: Find entity by ID
- `handleSave(entity, context?)`: Save entity
- `handleDelete(id, context?)`: Delete entity
- `handleCount(options?, context?)`: Count entities
- `handleExists(id, context?)`: Check existence

**Context & Configuration**
- `createContext(operation, metadata?)`: Create handler context
- `setConfig(config)`: Set handler configuration
- `getConfig()`: Get handler configuration

**Extensions**
- `addMiddleware(operation, middleware)`: Add operation middleware
- `addValidationRule(rule)`: Add validation rule

## Handler Context

```typescript
interface HandlerContext {
  operation: string;              // Operation name
  timestamp: Date;                // Operation timestamp
  metadata?: Record<string, unknown>; // Custom metadata
}
```

## Handler Result

```typescript
interface HandlerResult<T> {
  success: boolean;               // Operation success
  data?: T;                       // Result data
  error?: HandlerError;           // Error details
  metrics?: HandlerMetrics;       // Operation metrics
}
```

## Handler Configuration

```typescript
interface HandlerConfig {
  enableMetrics: boolean;         // Track execution metrics
  enableValidation: boolean;       // Enable entity validation
  enableCaching: boolean;         // Enable result caching
  enableTransactions: boolean;    // Enable transaction support
  maxRetries: number;            // Maximum retry attempts
}
```

## Validation Rules

```typescript
interface ValidationRule {
  field: string;                  // Field to validate
  validator: (value: unknown) => boolean; // Validator function
  errorMessage: string;          // Error message
}
```

## Middleware

Middleware functions allow pre/post operation processing:

```typescript
type HandlerMiddleware = (
  operation: RepositoryOperation,
  next: () => Promise<void>
) => Promise<void>;
```

### Middleware Example

```typescript
handler.addMiddleware(RepositoryOperation.SAVE, async (op, next) => {
  // Pre-operation logic
  console.log(`Starting ${op}`);
  
  await next();
  
  // Post-operation logic
  console.log(`Completed ${op}`);
});
```

## Repository Operations

- `FIND`: Query multiple entities
- `FIND_BY_ID`: Query single entity by ID
- `SAVE`: Create or update entity
- `DELETE`: Remove entity by ID
- `COUNT`: Count matching entities
- `EXISTS`: Check entity existence

## Error Handling

Handler errors include:

```typescript
interface HandlerError {
  code: string;                   // Error code
  message: string;                // Error message
  details?: Record<string, unknown>; // Additional details
  retryable?: boolean;            // Whether operation can be retried
}
```

## Metrics

Handler metrics track performance:

```typescript
interface HandlerMetrics {
  executionTime: number;          // Execution time in ms
  cacheHit?: boolean;             // Cache hit status
  transactionUsed?: boolean;      // Transaction usage
}
```

## Best Practices

1. **Enable Metrics**: Track performance in production
2. **Validate Input**: Add validation rules for critical fields
3. **Use Middleware**: Implement cross-cutting concerns via middleware
4. **Configure Retries**: Set appropriate retry limits
5. **Context Tracking**: Use context for request correlation

## Error Recovery

- Validation errors are not retryable
- Handler errors are retryable by default
- Use middleware for custom retry logic
- Configure maxRetries appropriately
