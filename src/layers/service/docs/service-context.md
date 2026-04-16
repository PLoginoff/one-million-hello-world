# Service Context

## Overview
The Service Layer uses a context object to propagate important information throughout the service layer, including user identity, correlation IDs, and audit trail information.

## Service Context Structure

### Context Definition
```typescript
interface ServiceContext {
  requestId: string;
  correlationId: string;
  traceId: string;
  userId?: string;
  timestamp: Date;
  metadata: Map<string, any>;
}
```

### Context Builder
```typescript
class ServiceContextBuilder {
  build(controllerContext: ControllerContext): ServiceContext {
    return {
      requestId: controllerContext.requestId,
      correlationId: controllerContext.correlationId,
      traceId: controllerContext.traceId,
      userId: controllerContext.userId,
      timestamp: new Date(),
      metadata: new Map(controllerContext.metadata)
    };
  }
  
  buildFromHeaders(headers: Map<string, string>): ServiceContext {
    return {
      requestId: headers.get('x-request-id') || this.generateId('req'),
      correlationId: headers.get('x-correlation-id') || this.generateId('corr'),
      traceId: headers.get('x-trace-id') || this.generateId('trace'),
      userId: headers.get('x-user-id'),
      timestamp: new Date(),
      metadata: new Map()
    };
  }
  
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}-${timestamp}-${random}`;
  }
}
```

## Context Propagation

### Propagation to Domain Layer
```typescript
class ContextPropagator {
  propagateToDomain(context: ServiceContext): DomainContext {
    return {
      requestId: context.requestId,
      correlationId: context.correlationId,
      traceId: context.traceId,
      userId: context.userId,
      operation: context.metadata.get('operation'),
      timestamp: context.timestamp
    };
  }
  
  propagateToRepository(context: ServiceContext): RepositoryContext {
    return {
      requestId: context.requestId,
      userId: context.userId,
      operation: context.metadata.get('operation'),
      timestamp: context.timestamp
    };
  }
  
  propagateToCache(context: ServiceContext): CacheContext {
    return {
      requestId: context.requestId,
      userId: context.userId,
      key: this.generateCacheKey(context),
      ttl: this.getCacheTTL(context)
    };
  }
  
  propagateToEventBus(context: ServiceContext): EventContext {
    return {
      requestId: context.requestId,
      correlationId: context.correlationId,
      traceId: context.traceId,
      userId: context.userId,
      eventType: context.metadata.get('eventType'),
      timestamp: context.timestamp
    };
  }
  
  private generateCacheKey(context: ServiceContext): string {
    const operation = context.metadata.get('operation') || 'default';
    const userId = context.userId || 'anonymous';
    return `${operation}:${userId}:${context.requestId}`;
  }
  
  private getCacheTTL(context: ServiceContext): number {
    return context.metadata.get('cacheTTL') || 300; // Default 5 minutes
  }
}
```

## Context Metadata

### Metadata Management
```typescript
class ContextMetadataManager {
  setMetadata(context: ServiceContext, key: string, value: any): void {
    context.metadata.set(key, value);
  }
  
  getMetadata(context: ServiceContext, key: string): any {
    return context.metadata.get(key);
  }
  
  setOperation(context: ServiceContext, operation: string): void {
    context.metadata.set('operation', operation);
  }
  
  getOperation(context: ServiceContext): string | undefined {
    return context.metadata.get('operation');
  }
  
  setAuditData(context: ServiceContext, data: AuditData): void {
    context.metadata.set('audit', data);
  }
  
  getAuditData(context: ServiceContext): AuditData | undefined {
    return context.metadata.get('audit');
  }
}

interface AuditData {
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Map<string, any>;
}
```

## Context Validation

### Context Validator
```typescript
class ContextValidator {
  validate(context: ServiceContext): ValidationResult {
    const errors: string[] = [];
    
    if (!context.requestId) {
      errors.push('Request ID is required');
    }
    
    if (!context.correlationId) {
      errors.push('Correlation ID is required');
    }
    
    if (!context.traceId) {
      errors.push('Trace ID is required');
    }
    
    if (!context.timestamp) {
      errors.push('Timestamp is required');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  validateUserId(context: ServiceContext): ValidationResult {
    const errors: string[] = [];
    
    if (context.userId && !this.isValidUserId(context.userId)) {
      errors.push('Invalid user ID format');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  private isValidUserId(userId: string): boolean {
    const userIdRegex = /^[a-zA-Z0-9_-]{3,50}$/;
    return userIdRegex.test(userId);
  }
}
```

## Context Interceptors

### Context Interceptor
```typescript
interface ContextInterceptor {
  intercept(context: ServiceContext): ServiceContext;
}

class LoggingInterceptor implements ContextInterceptor {
  intercept(context: ServiceContext): ServiceContext {
    this.logger.info('Service context created', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      traceId: context.traceId,
      userId: context.userId,
      operation: context.metadata.get('operation')
    });
    
    return context;
  }
}

class MetricsInterceptor implements ContextInterceptor {
  intercept(context: ServiceContext): ServiceContext {
    this.metricsCollector.increment('service.context.created', 1, {
      operation: context.metadata.get('operation')
    });
    
    return context;
  }
}

class TracingInterceptor implements ContextInterceptor {
  intercept(context: ServiceContext): ServiceContext {
    this.tracer.startSpan('service-context', {
      traceId: context.traceId,
      tags: {
        requestId: context.requestId,
        correlationId: context.correlationId,
        userId: context.userId
      }
    });
    
    return context;
  }
}
```

### Interceptor Chain
```typescript
class InterceptorChain {
  private interceptors: ContextInterceptor[] = [];
  
  addInterceptor(interceptor: ContextInterceptor): void {
    this.interceptors.push(interceptor);
  }
  
  execute(context: ServiceContext): ServiceContext {
    let result = context;
    
    for (const interceptor of this.interceptors) {
      result = interceptor.intercept(result);
    }
    
    return result;
  }
}
```

## Context Factory

### Context Factory
```typescript
class ServiceContextFactory {
  private builder: ServiceContextBuilder;
  private validator: ContextValidator;
  private interceptorChain: InterceptorChain;
  
  constructor(
    builder: ServiceContextBuilder,
    validator: ContextValidator,
    interceptorChain: InterceptorChain
  ) {
    this.builder = builder;
    this.validator = validator;
    this.interceptorChain = interceptorChain;
  }
  
  create(controllerContext: ControllerContext): ServiceContext {
    let context = this.builder.build(controllerContext);
    
    const validation = this.validator.validate(context);
    if (!validation.valid) {
      throw new ContextValidationError(validation.errors);
    }
    
    context = this.interceptorChain.execute(context);
    
    return context;
  }
}

class ContextValidationError extends Error {
  constructor(public errors: string[]) {
    super('Context validation failed');
    this.name = 'ContextValidationError';
  }
}
```

## Best Practices

### Context Design Guidelines
- Include all necessary tracking information
- Use consistent ID formats
- Include timestamp for audit trail
- Use metadata for additional context
- Validate context before use

### Context Propagation Guidelines
- Propagate context to all downstream services
- Include correlation IDs for distributed tracing
- Include user ID for authorization
- Preserve original request ID
- Add operation metadata for debugging

### Performance Considerations
- Use efficient ID generation
- Cache context validation results
- Minimize metadata size
- Use efficient data structures for metadata
