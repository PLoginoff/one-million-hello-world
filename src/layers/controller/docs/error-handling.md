# Error Handling

## Overview
The Controller Layer implements comprehensive error handling with automatic error catching, status code mapping, and detailed error response generation.

## Error Types

### Controller Errors
```typescript
class ControllerError extends Error {
  constructor(
    message: string,
    public statusCode: HttpStatusCode,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ControllerError';
  }
}

class ValidationError extends ControllerError {
  constructor(message: string, public field: string, public value?: any) {
    super(message, HttpStatusCode.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

class AuthorizationError extends ControllerError {
  constructor(message: string) {
    super(message, HttpStatusCode.FORBIDDEN, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends ControllerError {
  constructor(resource: string) {
    super(`${resource} not found`, HttpStatusCode.NOT_FOUND, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class ConflictError extends ControllerError {
  constructor(message: string) {
    super(message, HttpStatusCode.CONFLICT, 'CONFLICT');
    this.name = 'ConflictError';
  }
}
```

## Error Handling Strategy

### Error Handler
```typescript
class ErrorHandler {
  async handle(error: Error, context: ControllerContext): Promise<HttpResponse> {
    // Log error
    this.logger.error('Controller error occurred', {
      error: error.message,
      stack: error.stack,
      requestId: context.requestId,
      operation: context.metadata.get('operation')
    });
    
    // Convert to controller error if needed
    const controllerError = this.convertToControllerError(error);
    
    // Generate error response
    return this.generateErrorResponse(controllerError, context);
  }
  
  private convertToControllerError(error: Error): ControllerError {
    if (error instanceof ControllerError) {
      return error;
    }
    
    // Convert common errors to controller errors
    if (error.name === 'ValidationError') {
      return new ValidationError(error.message, 'unknown');
    }
    
    if (error.name === 'NotFoundError') {
      return new NotFoundError('Resource');
    }
    
    // Default to internal server error
    return new ControllerError(
      error.message,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR'
    );
  }
  
  private generateErrorResponse(error: ControllerError, context: ControllerContext): HttpResponse {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      requestId: context.requestId,
      timestamp: new Date()
    };
    
    const body = JSON.stringify(response);
    
    return {
      statusCode: error.statusCode,
      headers: new Map([
        ['content-type', 'application/json'],
        ['x-request-id', context.requestId]
      ]),
      body: Buffer.from(body)
    };
  }
}
```

### Error Middleware
```typescript
class ErrorMiddleware {
  private errorHandler: ErrorHandler;
  
  constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
  }
  
  async wrap(handler: HandlerFunction, context: ControllerContext): Promise<HttpResponse> {
    try {
      const result = await handler(context);
      return this.createSuccessResponse(result);
    } catch (error) {
      return await this.errorHandler.handle(error as Error, context);
    }
  }
  
  private createSuccessResponse(result: HandlerResult): HttpResponse {
    const statusCode = result.statusCode || HttpStatusCode.OK;
    const body = JSON.stringify({
      success: true,
      data: result.data
    });
    
    return {
      statusCode,
      headers: new Map([
        ['content-type', 'application/json']
      ]),
      body: Buffer.from(body)
    };
  }
}
```

## Status Code Mapping

### Status Code Mapper
```typescript
class StatusCodeMapper {
  private errorToStatusMap: Map<string, HttpStatusCode> = new Map([
    ['ValidationError', HttpStatusCode.UNPROCESSABLE_ENTITY],
    ['AuthorizationError', HttpStatusCode.FORBIDDEN],
    ['AuthenticationError', HttpStatusCode.UNAUTHORIZED],
    ['NotFoundError', HttpStatusCode.NOT_FOUND],
    ['ConflictError', HttpStatusCode.CONFLICT],
    ['BadRequestError', HttpStatusCode.BAD_REQUEST],
    ['MethodNotAllowedError', HttpStatusCode.METHOD_NOT_ALLOWED],
    ['NotImplementedError', HttpStatusCode.NOT_IMPLEMENTED],
    ['ServiceUnavailableError', HttpStatusCode.SERVICE_UNAVAILABLE]
  ]);
  
  map(error: Error): HttpStatusCode {
    if (error instanceof ControllerError) {
      return error.statusCode;
    }
    
    const mappedStatus = this.errorToStatusMap.get(error.name);
    if (mappedStatus) {
      return mappedStatus;
    }
    
    return HttpStatusCode.INTERNAL_SERVER_ERROR;
  }
}
```

## Error Detail Inclusion

### Error Detail Configuration
```typescript
interface ErrorDetailConfig {
  includeStack: boolean;
  includeDetails: boolean;
  includeValidationErrors: boolean;
  sanitizeErrorMessages: boolean;
}

class ErrorDetailManager {
  private config: ErrorDetailConfig;
  
  constructor(config: ErrorDetailConfig) {
    this.config = config;
  }
  
  getErrorDetails(error: ControllerError): any {
    const details: any = {};
    
    if (this.config.includeDetails && error.details) {
      details.details = error.details;
    }
    
    if (this.config.includeStack && process.env.NODE_ENV === 'development') {
      details.stack = error.stack;
    }
    
    if (this.config.sanitizeErrorMessages) {
      details.message = this.sanitizeMessage(error.message);
    } else {
      details.message = error.message;
    }
    
    return details;
  }
  
  private sanitizeMessage(message: string): string {
    // Remove sensitive information from error messages
    return message
      .replace(/password[=\s][^\s]+/gi, 'password=***')
      .replace(/token[=\s][^\s]+/gi, 'token=***')
      .replace(/key[=\s][^\s]+/gi, 'key=***');
  }
}
```

## Error Logging

### Error Logger
```typescript
class ErrorLogger {
  private logger: Logger;
  
  log(error: Error, context: ControllerContext): void {
    this.logger.error('Controller error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context: {
        requestId: context.requestId,
        correlationId: context.correlationId,
        traceId: context.traceId,
        operation: context.metadata.get('operation'),
        userId: context.userId
      },
      timestamp: new Date()
    });
  }
  
  logValidationErrors(errors: ValidationError[], context: ControllerContext): void {
    this.logger.warn('Validation errors', {
      errors: errors.map(e => ({
        field: e.field,
        message: e.message,
        value: e.value
      })),
      requestId: context.requestId,
      operation: context.metadata.get('operation')
    });
  }
}
```

## Error Recovery

### Recovery Strategies
```typescript
interface RecoveryStrategy {
  canRecover(error: Error): boolean;
  recover(error: Error, context: ControllerContext): Promise<HttpResponse>;
}

class RetryStrategy implements RecoveryStrategy {
  private maxRetries: number;
  private retryableErrors: string[];
  
  constructor(maxRetries: number, retryableErrors: string[]) {
    this.maxRetries = maxRetries;
    this.retryableErrors = retryableErrors;
  }
  
  canRecover(error: Error): boolean {
    return this.retryableErrors.includes(error.name);
  }
  
  async recover(error: Error, context: ControllerContext): Promise<HttpResponse> {
    let lastError = error;
    
    for (let i = 0; i < this.maxRetries; i++) {
      await this.delay(100 * (i + 1)); // Exponential backoff
      
      try {
        const handler = context.metadata.get('handler') as HandlerFunction;
        const result = await handler(context);
        return this.createSuccessResponse(result);
      } catch (e) {
        lastError = e as Error;
      }
    }
    
    // All retries failed, return error response
    return this.createErrorResponse(lastError);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private createSuccessResponse(result: HandlerResult): HttpResponse {
    const body = JSON.stringify({ success: true, data: result.data });
    return {
      statusCode: HttpStatusCode.OK,
      headers: new Map([['content-type', 'application/json']]),
      body: Buffer.from(body)
    };
  }
  
  private createErrorResponse(error: Error): HttpResponse {
    const body = JSON.stringify({ success: false, error: error.message });
    return {
      statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
      headers: new Map([['content-type', 'application/json']]),
      body: Buffer.from(body)
    };
  }
}
```

## Best Practices

### Error Handling Guidelines
- Catch errors at appropriate levels
- Provide meaningful error messages
- Use appropriate HTTP status codes
- Include request ID in error responses
- Log errors with sufficient context
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
