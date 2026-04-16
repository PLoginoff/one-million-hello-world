# Response Generation

## Overview
The Controller Layer generates HTTP responses with appropriate status codes, headers, and body content based on handler results.

## Response Structure

### HTTP Response
```typescript
interface HttpResponse {
  statusCode: HttpStatusCode;
  headers: Map<string, string>;
  body: Buffer;
}

enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  SERVICE_UNAVAILABLE = 503
}
```

## Success Response Generation

### Success Response Builder
```typescript
class SuccessResponseBuilder {
  build(data: any, statusCode: HttpStatusCode = HttpStatusCode.OK): HttpResponse {
    const body = JSON.stringify({
      success: true,
      data
    });
    
    return {
      statusCode,
      headers: this.getDefaultHeaders(),
      body: Buffer.from(body)
    };
  }
  
  buildCreated(data: any): HttpResponse {
    return this.build(data, HttpStatusCode.CREATED);
  }
  
  buildNoContent(): HttpResponse {
    return {
      statusCode: HttpStatusCode.NO_CONTENT,
      headers: this.getDefaultHeaders(),
      body: Buffer.alloc(0)
    };
  }
  
  private getDefaultHeaders(): Map<string, string> {
    return new Map([
      ['content-type', 'application/json'],
      ['x-content-type-options', 'nosniff'],
      ['x-frame-options', 'DENY'],
      ['x-xss-protection', '1; mode=block']
    ]);
  }
}
```

### Pagination Response
```typescript
interface PaginatedResponse {
  data: any[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

class PaginatedResponseBuilder {
  build(data: any[], page: number, pageSize: number, totalCount: number): HttpResponse {
    const totalPages = Math.ceil(totalCount / pageSize);
    
    const response: PaginatedResponse = {
      data,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      }
    };
    
    const body = JSON.stringify({
      success: true,
      ...response
    });
    
    return {
      statusCode: HttpStatusCode.OK,
      headers: new Map([
        ['content-type', 'application/json']
      ]),
      body: Buffer.from(body)
    };
  }
}
```

## Error Response Generation

### Error Response Builder
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    stack?: string;
  };
  requestId?: string;
  timestamp: Date;
}

class ErrorResponseBuilder {
  build(error: Error, statusCode: HttpStatusCode, requestId?: string): HttpResponse {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: this.getErrorCode(error),
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      requestId,
      timestamp: new Date()
    };
    
    const body = JSON.stringify(response);
    
    return {
      statusCode,
      headers: new Map([
        ['content-type', 'application/json']
      ]),
      body: Buffer.from(body)
    };
  }
  
  private getErrorCode(error: Error): string {
    if (error instanceof ValidationError) {
      return 'VALIDATION_ERROR';
    }
    if (error instanceof AuthorizationError) {
      return 'AUTHORIZATION_ERROR';
    }
    if (error instanceof NotFoundError) {
      return 'NOT_FOUND';
    }
    if (error instanceof ConflictError) {
      return 'CONFLICT';
    }
    return 'INTERNAL_ERROR';
  }
}
```

### Validation Error Response
```typescript
class ValidationErrorResponseBuilder {
  build(errors: ValidationError[], requestId?: string): HttpResponse {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: errors.map(e => ({
          field: e.field,
          message: e.message,
          value: e.value
        }))
      },
      requestId,
      timestamp: new Date()
    };
    
    const body = JSON.stringify(response);
    
    return {
      statusCode: HttpStatusCode.UNPROCESSABLE_ENTITY,
      headers: new Map([
        ['content-type', 'application/json']
      ]),
      body: Buffer.from(body)
    };
  }
}
```

## Header Generation

### Header Manager
```typescript
class HeaderManager {
  private defaultHeaders: Map<string, string> = new Map();
  private customHeaders: Map<string, string> = new Map();
  
  addDefaultHeader(key: string, value: string): void {
    this.defaultHeaders.set(key, value);
  }
  
  addCustomHeader(key: string, value: string): void {
    this.customHeaders.set(key, value);
  }
  
  buildHeaders(context: ControllerContext): Map<string, string> {
    const headers = new Map<string, string>();
    
    // Add default headers
    for (const [key, value] of this.defaultHeaders) {
      headers.set(key, value);
    }
    
    // Add custom headers
    for (const [key, value] of this.customHeaders) {
      headers.set(key, value);
    }
    
    // Add context headers
    headers.set('x-request-id', context.requestId);
    headers.set('x-correlation-id', context.correlationId);
    headers.set('x-trace-id', context.traceId);
    
    return headers;
  }
}
```

### CORS Headers
```typescript
class CORSHeaderGenerator {
  generate(origin: string, allowedMethods: string[]): Map<string, string> {
    const headers = new Map<string, string>();
    
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', allowedMethods.join(', '));
    headers.set('access-control-allow-headers', 'Content-Type, Authorization');
    headers.set('access-control-allow-credentials', 'true');
    headers.set('access-control-max-age', '86400');
    
    return headers;
  }
}
```

## Response Formatting

### JSON Formatter
```typescript
class JSONFormatter {
  format(data: any, pretty: boolean = false): string {
    if (pretty) {
      return JSON.stringify(data, null, 2);
    }
    return JSON.stringify(data);
  }
  
  formatWithMetadata(data: any, metadata: ResponseMetadata): string {
    const response = {
      ...data,
      _metadata: metadata
    };
    return JSON.stringify(response);
  }
}

interface ResponseMetadata {
  requestId: string;
  timestamp: Date;
  version: string;
  environment: string;
}
```

### Response Compression
```typescript
class ResponseCompressor {
  compress(body: Buffer, algorithm: CompressionAlgorithm = CompressionAlgorithm.GZIP): Buffer {
    switch (algorithm) {
      case CompressionAlgorithm.GZIP:
        return this.gzipCompress(body);
      case CompressionAlgorithm.DEFLATE:
        return this.deflateCompress(body);
      case CompressionAlgorithm.BROTLI:
        return this.brotliCompress(body);
      default:
        return body;
    }
  }
  
  private gzipCompress(body: Buffer): Buffer {
    return zlib.gzipSync(body);
  }
  
  private deflateCompress(body: Buffer): Buffer {
    return zlib.deflateSync(body);
  }
  
  private brotliCompress(body: Buffer): Buffer {
    return zlib.brotliCompressSync(body);
  }
}

enum CompressionAlgorithm {
  GZIP = 'gzip',
  DEFLATE = 'deflate',
  BROTLI = 'br'
}
```

## Response Caching

### Cache Headers
```typescript
class CacheHeaderGenerator {
  generate(maxAge: number): Map<string, string> {
    const headers = new Map<string, string>();
    
    headers.set('cache-control', `max-age=${maxAge}`);
    headers.set('expires', new Date(Date.now() + maxAge * 1000).toUTCString());
    headers.set('etag', this.generateETag());
    
    return headers;
  }
  
  generateNoCache(): Map<string, string> {
    const headers = new Map<string, string>();
    
    headers.set('cache-control', 'no-cache, no-store, must-revalidate');
    headers.set('pragma', 'no-cache');
    headers.set('expires', '0');
    
    return headers;
  }
  
  private generateETag(): string {
    return `"${this.generateId()}"`;
  }
  
  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}
```

## Best Practices

### Response Design Guidelines
- Use appropriate HTTP status codes
- Include consistent response structure
- Provide clear error messages
- Include request ID for tracing
- Use JSON for API responses
- Implement compression for large responses

### Header Management Guidelines
- Set security headers by default
- Include CORS headers when needed
- Use cache headers appropriately
- Include correlation headers for tracing
- Set appropriate content-type headers

### Performance Considerations
- Use response compression
- Implement response caching
- Stream large responses
- Minimize response size
- Use efficient serialization
