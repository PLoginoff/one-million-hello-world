# Request Handling

## Overview
The Controller Layer handles incoming requests through registered handlers, executes them asynchronously, and propagates context throughout the request lifecycle.

## Handler Definition

### Handler Function Type
```typescript
type HandlerFunction = (context: ControllerContext) => Promise<HandlerResult>;

interface HandlerResult {
  success: boolean;
  data?: any;
  error?: Error;
  statusCode?: HttpStatusCode;
}

interface ControllerContext {
  request: HttpRequest;
  requestId: string;
  correlationId: string;
  traceId: string;
  userId?: string;
  parameters: Map<string, any>;
  headers: Map<string, string>;
  metadata: Map<string, any>;
}
```

### Handler Registration
```typescript
class HandlerRegistry {
  private handlers: Map<string, HandlerFunction> = new Map();
  
  register(operation: string, handler: HandlerFunction): void {
    this.handlers.set(operation, handler);
  }
  
  unregister(operation: string): void {
    this.handlers.delete(operation);
  }
  
  get(operation: string): HandlerFunction | undefined {
    return this.handlers.get(operation);
  }
  
  has(operation: string): boolean {
    return this.handlers.has(operation);
  }
  
  getAll(): Map<string, HandlerFunction> {
    return new Map(this.handlers);
  }
  
  clear(): void {
    this.handlers.clear();
  }
}
```

## Request Processing

### Request Handler
```typescript
class RequestHandler {
  private handlerRegistry: HandlerRegistry;
  private contextBuilder: ContextBuilder;
  
  async handle(request: HttpRequest, operation: string): Promise<HttpResponse> {
    const handler = this.handlerRegistry.get(operation);
    
    if (!handler) {
      return this.createNotFoundResponse();
    }
    
    const context = await this.contextBuilder.build(request);
    
    try {
      const result = await handler(context);
      return this.createResponse(result);
    } catch (error) {
      return this.createErrorResponse(error);
    }
  }
  
  private createResponse(result: HandlerResult): HttpResponse {
    const statusCode = result.statusCode || HttpStatusCode.OK;
    const body = result.success ? JSON.stringify({ success: true, data: result.data }) : JSON.stringify({ success: false });
    
    return {
      statusCode,
      headers: new Map([
        ['content-type', 'application/json'],
        ['x-request-id', this.contextBuilder.getRequestId()]
      ]),
      body: Buffer.from(body)
    };
  }
  
  private createNotFoundResponse(): HttpResponse {
    return {
      statusCode: HttpStatusCode.NOT_FOUND,
      headers: new Map([
        ['content-type', 'application/json']
      ]),
      body: Buffer.from(JSON.stringify({ success: false, error: 'Handler not found' }))
    };
  }
  
  private createErrorResponse(error: Error): HttpResponse {
    return {
      statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
      headers: new Map([
        ['content-type', 'application/json']
      ]),
      body: Buffer.from(JSON.stringify({ success: false, error: error.message }))
    };
  }
}
```

## Context Building

### Context Builder
```typescript
class ContextBuilder {
  async build(request: HttpRequest): Promise<ControllerContext> {
    const requestId = this.extractRequestId(request);
    const correlationId = this.extractCorrelationId(request);
    const traceId = this.extractTraceId(request);
    const userId = this.extractUserId(request);
    const parameters = this.extractParameters(request);
    
    return {
      request,
      requestId,
      correlationId,
      traceId,
      userId,
      parameters,
      headers: new Map(request.headers),
      metadata: new Map()
    };
  }
  
  private extractRequestId(request: HttpRequest): string {
    return request.headers.get('x-request-id') || this.generateId('req');
  }
  
  private extractCorrelationId(request: HttpRequest): string {
    return request.headers.get('x-correlation-id') || this.generateId('corr');
  }
  
  private extractTraceId(request: HttpRequest): string {
    return request.headers.get('x-trace-id') || this.generateId('trace');
  }
  
  private extractUserId(request: HttpRequest): string | undefined {
    return request.securityContext?.userId;
  }
  
  private extractParameters(request: HttpRequest): Map<string, any> {
    const parameters = new Map<string, any>();
    
    // Extract path parameters from route match
    if (request.routeMatch) {
      for (const [key, value] of request.routeMatch.parameters) {
        parameters.set(key, value);
      }
    }
    
    // Extract query parameters
    const queryString = request.uri.split('?')[1];
    if (queryString) {
      const urlParams = new URLSearchParams(queryString);
      for (const [key, value] of urlParams) {
        parameters.set(key, value);
      }
    }
    
    return parameters;
  }
  
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}-${timestamp}-${random}`;
  }
}
```

## Handler Execution

### Async Handler Execution
```typescript
class HandlerExecutor {
  async execute(handler: HandlerFunction, context: ControllerContext): Promise<HandlerResult> {
    const startTime = Date.now();
    
    try {
      const result = await handler(context);
      const duration = Date.now() - startTime;
      
      this.metricsCollector.timing('handler.execution', duration, {
        operation: context.metadata.get('operation')
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.metricsCollector.increment('handler.errors', 1, {
        operation: context.metadata.get('operation'),
        errorType: error.constructor.name
      });
      
      this.logger.error('Handler execution failed', {
        error,
        operation: context.metadata.get('operation'),
        duration
      });
      
      throw error;
    }
  }
}
```

### Handler Orchestration
```typescript
class HandlerOrchestrator {
  private preHandlers: HandlerFunction[] = [];
  private postHandlers: HandlerFunction[] = [];
  
  addPreHandler(handler: HandlerFunction): void {
    this.preHandlers.push(handler);
  }
  
  addPostHandler(handler: HandlerFunction): void {
    this.postHandlers.push(handler);
  }
  
  async execute(
    handler: HandlerFunction,
    context: ControllerContext
  ): Promise<HandlerResult> {
    // Execute pre-handlers
    for (const preHandler of this.preHandlers) {
      const result = await preHandler(context);
      if (!result.success) {
        return result;
      }
    }
    
    // Execute main handler
    const result = await handler(context);
    
    // Execute post-handlers
    for (const postHandler of this.postHandlers) {
      const postResult = await postHandler(context);
      if (!postResult.success) {
        return postResult;
      }
    }
    
    return result;
  }
}
```

## Context Propagation

### Context Propagation
```typescript
class ContextPropagator {
  propagateToService(context: ControllerContext): ServiceContext {
    return {
      requestId: context.requestId,
      correlationId: context.correlationId,
      traceId: context.traceId,
      userId: context.userId,
      parameters: context.parameters,
      headers: context.headers,
      metadata: context.metadata
    };
  }
  
  propagateToDatabase(context: ControllerContext): DatabaseContext {
    return {
      requestId: context.requestId,
      userId: context.userId,
      operation: context.metadata.get('operation'),
      timestamp: new Date()
    };
  }
  
  propagateToCache(context: ControllerContext): CacheContext {
    return {
      requestId: context.requestId,
      userId: context.userId,
      key: this.generateCacheKey(context),
      ttl: this.getCacheTTL(context)
    };
  }
  
  private generateCacheKey(context: ControllerContext): string {
    const operation = context.metadata.get('operation') || 'default';
    const userId = context.userId || 'anonymous';
    return `${operation}:${userId}:${context.requestId}`;
  }
  
  private getCacheTTL(context: ControllerContext): number {
    return context.metadata.get('cacheTTL') || 300; // Default 5 minutes
  }
}
```

## Best Practices

### Handler Design Guidelines
- Keep handlers focused and single-purpose
- Use async/await for I/O operations
- Return consistent result structures
- Handle errors gracefully
- Log important operations
- Validate inputs before processing

### Context Management Guidelines
- Extract all relevant context information
- Propagate context to all downstream services
- Include correlation IDs for tracing
- Preserve headers for debugging
- Use consistent ID formats

### Performance Considerations
- Use async operations for I/O-bound tasks
- Implement handler caching where appropriate
- Use connection pooling for database operations
- Implement request batching when possible
- Monitor handler execution times
