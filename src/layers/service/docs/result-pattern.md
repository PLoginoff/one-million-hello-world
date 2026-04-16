# Result Pattern

## Overview
The Service Layer uses a Result pattern to provide type-safe, consistent handling of operation outcomes with success/failure indication and optional data or error details.

## Result Structure

### Result Definition
```typescript
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceError;
}

interface ServiceError {
  code: string;
  message: string;
  details?: any;
}
```

### Result Factory
```typescript
class ServiceResult {
  static success<T>(data: T): ServiceResult<T> {
    return {
      success: true,
      data
    };
  }
  
  static failure<T>(error: ServiceError): ServiceResult<T> {
    return {
      success: false,
      error
    };
  }
  
  static fromError<T>(error: Error): ServiceResult<T> {
    return {
      success: false,
      error: {
        code: error.name || 'UNKNOWN_ERROR',
        message: error.message,
        details: error.stack
      }
    };
  }
}
```

## Result Handling

### Result Handler
```typescript
class ResultHandler {
  static onSuccess<T>(result: ServiceResult<T>, callback: (data: T) => void): void {
    if (result.success && result.data) {
      callback(result.data);
    }
  }
  
  static onFailure<T>(result: ServiceResult<T>, callback: (error: ServiceError) => void): void {
    if (!result.success && result.error) {
      callback(result.error);
    }
  }
  
  static handle<T>(
    result: ServiceResult<T>,
    onSuccess: (data: T) => void,
    onFailure: (error: ServiceError) => void
  ): void {
    if (result.success) {
      if (result.data) onSuccess(result.data);
    } else {
      if (result.error) onFailure(result.error);
    }
  }
}
```

### Result Mapping
```typescript
class ResultMapper {
  static map<T, U>(result: ServiceResult<T>, mapper: (data: T) => U): ServiceResult<U> {
    if (!result.success || !result.data) {
      return result as ServiceResult<U>;
    }
    
    try {
      const mappedData = mapper(result.data);
      return ServiceResult.success(mappedData);
    } catch (error) {
      return ServiceResult.fromError(error as Error);
    }
  }
  
  static flatMap<T, U>(result: ServiceResult<T>, mapper: (data: T) => ServiceResult<U>): ServiceResult<U> {
    if (!result.success || !result.data) {
      return result as ServiceResult<U>;
    }
    
    return mapper(result.data);
  }
}
```

### Result Chaining
```typescript
class ResultChain {
  static chain<T>(...operations: ((data: any) => ServiceResult<any>)[]): ServiceResult<T> {
    let result: ServiceResult<any> = ServiceResult.success({});
    
    for (const operation of operations) {
      if (!result.success) {
        return result as ServiceResult<T>;
      }
      
      result = operation(result.data);
    }
    
    return result as ServiceResult<T>;
  }
}
```

## Error Codes

### Standard Error Codes
```typescript
enum ServiceErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}
```

### Error Code Mapper
```typescript
class ErrorCodeMapper {
  static fromException(error: Error): ServiceErrorCode {
    if (error instanceof ValidationError) {
      return ServiceErrorCode.VALIDATION_ERROR;
    }
    if (error instanceof NotFoundError) {
      return ServiceErrorCode.NOT_FOUND;
    }
    if (error instanceof ConflictError) {
      return ServiceErrorCode.CONFLICT;
    }
    if (error instanceof PermissionDeniedError) {
      return ServiceErrorCode.PERMISSION_DENIED;
    }
    if (error instanceof UnauthorizedError) {
      return ServiceErrorCode.UNAUTHORIZED;
    }
    return ServiceErrorCode.INTERNAL_ERROR;
  }
}
```

## Result Validation

### Result Validator
```typescript
class ResultValidator {
  static validate<T>(result: ServiceResult<T>): ValidationResult {
    if (result.success) {
      return { valid: true, errors: [] };
    }
    
    const errors: string[] = [];
    
    if (!result.error) {
      errors.push('Error details missing');
    } else {
      if (!result.error.code) {
        errors.push('Error code missing');
      }
      if (!result.error.message) {
        errors.push('Error message missing');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## Result Transformation

### Result Transformer
```typescript
class ResultTransformer {
  static toHttpResponse<T>(result: ServiceResult<T>): HttpResponse {
    if (result.success) {
      return {
        statusCode: HttpStatusCode.OK,
        headers: new Map([['content-type', 'application/json']]),
        body: Buffer.from(JSON.stringify({ success: true, data: result.data }))
      };
    }
    
    const statusCode = this.getStatusCodeForError(result.error?.code);
    
    return {
      statusCode,
      headers: new Map([['content-type', 'application/json']]),
      body: Buffer.from(JSON.stringify({ success: false, error: result.error }))
    };
  }
  
  private static getStatusCodeForError(code?: string): HttpStatusCode {
    const statusMap: Map<string, HttpStatusCode> = new Map([
      [ServiceErrorCode.VALIDATION_ERROR, HttpStatusCode.UNPROCESSABLE_ENTITY],
      [ServiceErrorCode.NOT_FOUND, HttpStatusCode.NOT_FOUND],
      [ServiceErrorCode.ALREADY_EXISTS, HttpStatusCode.CONFLICT],
      [ServiceErrorCode.PERMISSION_DENIED, HttpStatusCode.FORBIDDEN],
      [ServiceErrorCode.UNAUTHORIZED, HttpStatusCode.UNAUTHORIZED],
      [ServiceErrorCode.CONFLICT, HttpStatusCode.CONFLICT],
      [ServiceErrorCode.RATE_LIMIT_EXCEEDED, HttpStatusCode.TOO_MANY_REQUESTS],
      [ServiceErrorCode.SERVICE_UNAVAILABLE, HttpStatusCode.SERVICE_UNAVAILABLE],
      [ServiceErrorCode.TIMEOUT, HttpStatusCode.REQUEST_TIMEOUT]
    ]);
    
    return statusMap.get(code || '') || HttpStatusCode.INTERNAL_SERVER_ERROR;
  }
}
```

## Result Aggregation

### Result Aggregator
```typescript
class ResultAggregator {
  static aggregate<T>(results: ServiceResult<T>[]): ServiceResult<T[]> {
    const successes: T[] = [];
    const errors: ServiceError[] = [];
    
    for (const result of results) {
      if (result.success && result.data) {
        successes.push(result.data);
      } else if (result.error) {
        errors.push(result.error);
      }
    }
    
    if (errors.length > 0) {
      return ServiceResult.failure({
        code: 'AGGREGATION_ERROR',
        message: `${errors.length} operations failed`,
        details: errors
      });
    }
    
    return ServiceResult.success(successes);
  }
  
  static firstSuccess<T>(results: ServiceResult<T>[]): ServiceResult<T> {
    for (const result of results) {
      if (result.success && result.data) {
        return result;
      }
    }
    
    return ServiceResult.failure({
      code: 'NO_SUCCESS',
      message: 'No operation succeeded'
    });
  }
  
  static allOrFail<T>(results: ServiceResult<T>[]): ServiceResult<T[]> {
    const successes: T[] = [];
    
    for (const result of results) {
      if (!result.success) {
        return result as ServiceResult<T[]>;
      }
      
      if (result.data) {
        successes.push(result.data);
      }
    }
    
    return ServiceResult.success(successes);
  }
}
```

## Best Practices

### Result Design Guidelines
- Use consistent result structure
- Include descriptive error codes
- Provide helpful error messages
- Include error details when useful
- Use type-safe result handling

### Error Handling Guidelines
- Map exceptions to appropriate error codes
- Include sufficient error context
- Sanitize error messages in production
- Log errors with correlation IDs
- Use appropriate HTTP status codes

### Performance Considerations
- Avoid unnecessary result copying
- Use efficient error serialization
- Cache error code mappings
- Minimize result transformation overhead
