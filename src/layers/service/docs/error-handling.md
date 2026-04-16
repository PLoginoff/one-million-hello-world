# Error Handling

## Overview
The Service Layer implements comprehensive error handling with use case error catching, error code mapping, and detailed error response generation.

## Service Errors

### Error Types
```typescript
class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

class ValidationError extends ServiceError {
  constructor(message: string, public field: string, public value?: any) {
    super(message, ServiceErrorCode.VALIDATION_ERROR);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends ServiceError {
  constructor(resource: string) {
    super(`${resource} not found`, ServiceErrorCode.NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends ServiceError {
  constructor(message: string) {
    super(message, ServiceErrorCode.CONFLICT);
    this.name = 'ConflictError';
  }
}

class PermissionDeniedError extends ServiceError {
  constructor(message: string) {
    super(message, ServiceErrorCode.PERMISSION_DENIED);
    this.name = 'PermissionDeniedError';
  }
}
```

## Error Handling Strategy

### Error Handler
```typescript
class ServiceErrorHandler {
  handle(error: Error, context: ServiceContext): ServiceResult<any> {
    // Log error
    this.logger.error('Service error occurred', {
      error: error.message,
      stack: error.stack,
      requestId: context.requestId,
      correlationId: context.correlationId,
      operation: context.metadata.get('operation')
    });
    
    // Convert to service error if needed
    const serviceError = this.convertToServiceError(error);
    
    return ServiceResult.failure({
      code: serviceError.code,
      message: serviceError.message,
      details: serviceError.details
    });
  }
  
  private convertToServiceError(error: Error): ServiceError {
    if (error instanceof ServiceError) {
      return error;
    }
    
    // Convert common errors to service errors
    if (error.name === 'ValidationError') {
      return new ValidationError(error.message, 'unknown');
    }
    
    if (error.name === 'NotFoundError') {
      return new NotFoundError('Resource');
    }
    
    // Default to internal error
    return new ServiceError(
      error.message,
      ServiceErrorCode.INTERNAL_ERROR,
      process.env.NODE_ENV === 'development' ? error.stack : undefined
    );
  }
}
```

### Error Middleware
```typescript
class ServiceErrorMiddleware {
  private errorHandler: ServiceErrorHandler;
  
  constructor(errorHandler: ServiceErrorHandler) {
    this.errorHandler = errorHandler;
  }
  
  async wrap<TInput, TOutput>(
    useCase: UseCase<TInput, TOutput>,
    input: TInput,
    context: ServiceContext
  ): Promise<ServiceResult<TOutput>> {
    try {
      return await useCase.execute(input, context);
    } catch (error) {
      return this.errorHandler.handle(error as Error, context);
    }
  }
}
```

## Use Case Not Found Errors

### Use Case Not Found Handler
```typescript
class UseCaseNotFoundHandler {
  handle(useCaseName: string, context: ServiceContext): ServiceResult<any> {
    this.logger.warn('Use case not found', {
      useCaseName,
      requestId: context.requestId,
      correlationId: context.correlationId
    });
    
    return ServiceResult.failure({
      code: 'USE_CASE_NOT_FOUND',
      message: `Use case '${useCaseName}' not found`,
      details: {
        availableUseCases: this.getAvailableUseCases()
      }
    });
  }
  
  private getAvailableUseCases(): string[] {
    return Array.from(this.useCaseRegistry.getAll().keys());
  }
}
```

## Error Recovery

### Retry Strategy
```typescript
interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
  retryableErrors: string[];
}

class RetryStrategy {
  private config: RetryConfig;
  
  constructor(config: RetryConfig) {
    this.config = config;
  }
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (!this.shouldRetry(error as Error)) {
          throw error;
        }
        
        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.backoffMs * Math.pow(2, attempt));
        }
      }
    }
    
    throw lastError;
  }
  
  private shouldRetry(error: Error): boolean {
    const serviceError = error as ServiceError;
    return this.config.retryableErrors.includes(serviceError.code);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Circuit Breaker

### Circuit Breaker Pattern
```typescript
enum CircuitState {
  CLOSED,
  OPEN,
  HALF_OPEN
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: Date | null = null;
  private successCount: number = 0;
  
  constructor(
    private threshold: number,
    private timeout: number,
    private halfOpenMaxCalls: number
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxCalls) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.OPEN;
    }
  }
  
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return elapsed >= this.timeout;
  }
  
  getState(): CircuitState {
    return this.state;
  }
}
```

## Error Logging

### Error Logger
```typescript
class ServiceErrorLogger {
  log(error: ServiceError, context: ServiceContext): void {
    this.logger.error('Service error', {
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      context: {
        requestId: context.requestId,
        correlationId: context.correlationId,
        traceId: context.traceId,
        userId: context.userId,
        operation: context.metadata.get('operation')
      },
      timestamp: new Date()
    });
  }
  
  logUseCaseError(useCaseName: string, error: Error, context: ServiceContext): void {
    this.logger.error('Use case execution failed', {
      useCaseName,
      error: error.message,
      stack: error.stack,
      requestId: context.requestId,
      correlationId: context.correlationId
    });
  }
}
```

## Best Practices

### Error Handling Guidelines
- Catch errors at appropriate levels
- Provide meaningful error messages
- Use appropriate error codes
- Include sufficient error context
- Log errors with correlation IDs
- Sanitize error messages in production

### Error Recovery Guidelines
- Implement retry strategies for transient errors
- Use exponential backoff for retries
- Set appropriate retry limits
- Monitor retry success rates
- Circuit break for persistent failures

### Security Considerations
- Sanitize error messages
- Don't expose stack traces in production
- Don't include sensitive data in errors
- Implement rate limiting for error responses
