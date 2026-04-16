# Tracing and Correlation

## Overview
The Middleware Layer provides distributed tracing capabilities with span management, events, links, and correlation ID tracking for request tracing across layers.

## Distributed Tracing

### Trace and Span IDs
```typescript
class TraceIdGenerator {
  generateTraceId(): string {
    return this.generateId('trace');
  }
  
  generateSpanId(): string {
    return this.generateId('span');
  }
  
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}-${timestamp}-${random}`;
  }
}
```

### Span Structure
```typescript
interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  tags: Map<string, string>;
  events: SpanEvent[];
  links: SpanLink[];
  status: SpanStatus;
  error?: SpanError;
}

interface SpanEvent {
  timestamp: Date;
  name: string;
  attributes: Map<string, any>;
}

interface SpanLink {
  traceId: string;
  spanId: string;
  attributes: Map<string, string>;
}

enum SpanStatus {
  OK = 'ok',
  ERROR = 'error',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

interface SpanError {
  type: string;
  message: string;
  stack?: string;
}
```

### Tracer Implementation
```typescript
class Tracer {
  private activeSpans: Map<string, Span> = new Map();
  
  startSpan(operationName: string, parentSpanId?: string): Span {
    const span: Span = {
      traceId: this.getTraceId(),
      spanId: this.traceIdGenerator.generateSpanId(),
      parentSpanId,
      operationName,
      startTime: new Date(),
      tags: new Map(),
      events: [],
      links: [],
      status: SpanStatus.OK
    };
    
    this.activeSpans.set(span.spanId, span);
    return span;
  }
  
  finishSpan(spanId: string, status?: SpanStatus, error?: SpanError): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    
    span.endTime = new Date();
    span.duration = span.endTime.getTime() - span.startTime.getTime();
    span.status = status || SpanStatus.OK;
    if (error) span.error = error;
    
    this.activeSpans.delete(spanId);
    this.spanStore.save(span);
  }
  
  addEvent(spanId: string, name: string, attributes?: Map<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    
    span.events.push({
      timestamp: new Date(),
      name,
      attributes: attributes || new Map()
    });
  }
  
  addLink(spanId: string, traceId: string, linkedSpanId: string, attributes?: Map<string, string>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    
    span.links.push({
      traceId,
      spanId: linkedSpanId,
      attributes: attributes || new Map()
    });
  }
  
  setTag(spanId: string, key: string, value: string): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;
    
    span.tags.set(key, value);
  }
  
  private getTraceId(): string {
    return this.correlationManager.getTraceId() || this.traceIdGenerator.generateTraceId();
  }
}
```

### Span Filtering
```typescript
interface SpanFilter {
  traceId?: string;
  operationName?: string;
  status?: SpanStatus;
  startTime?: Date;
  endTime?: Date;
}

class SpanFilter {
  filter(spans: Span[], filter: SpanFilter): Span[] {
    let result = [...spans];
    
    if (filter.traceId) {
      result = result.filter(s => s.traceId === filter.traceId);
    }
    
    if (filter.operationName) {
      const pattern = new RegExp(filter.operationName, 'i');
      result = result.filter(s => pattern.test(s.operationName));
    }
    
    if (filter.status) {
      result = result.filter(s => s.status === filter.status);
    }
    
    if (filter.startTime) {
      result = result.filter(s => s.startTime >= filter.startTime);
    }
    
    if (filter.endTime) {
      result = result.filter(s => s.endTime && s.endTime <= filter.endTime);
    }
    
    return result;
  }
}
```

### Span Retrieval
```typescript
class SpanStore {
  private spans: Map<string, Span> = new Map();
  
  save(span: Span): void {
    this.spans.set(`${span.traceId}:${span.spanId}`, span);
  }
  
  getByTraceId(traceId: string): Span[] {
    return Array.from(this.spans.values()).filter(s => s.traceId === traceId);
  }
  
  getBySpanId(spanId: string): Span | undefined {
    return Array.from(this.spans.values()).find(s => s.spanId === spanId);
  }
  
  getAll(): Span[] {
    return Array.from(this.spans.values());
  }
  
  clear(): void {
    this.spans.clear();
  }
}
```

## Correlation IDs

### Correlation Context
```typescript
interface CorrelationContext {
  requestId: string;
  correlationId: string;
  traceId: string;
  userId?: string;
  timestamp: Date;
}

class CorrelationManager {
  private contexts: Map<string, CorrelationContext> = new Map();
  
  createContext(userId?: string): CorrelationContext {
    const context: CorrelationContext = {
      requestId: this.generateId('req'),
      correlationId: this.generateId('corr'),
      traceId: this.traceIdGenerator.generateTraceId(),
      userId,
      timestamp: new Date()
    };
    
    this.contexts.set(context.requestId, context);
    return context;
  }
  
  getContext(requestId: string): CorrelationContext | undefined {
    return this.contexts.get(requestId);
  }
  
  setContext(context: CorrelationContext): void {
    this.contexts.set(context.requestId, context);
  }
  
  clearContext(requestId: string): void {
    this.contexts.delete(requestId);
  }
  
  clearAll(): void {
    this.contexts.clear();
  }
  
  getRequestId(): string | undefined {
    return this.getCurrentContext()?.requestId;
  }
  
  getCorrelationId(): string | undefined {
    return this.getCurrentContext()?.correlationId;
  }
  
  getTraceId(): string | undefined {
    return this.getCurrentContext()?.traceId;
  }
  
  getUserId(): string | undefined {
    return this.getCurrentContext()?.userId;
  }
  
  private getCurrentContext(): CorrelationContext | undefined {
    // In a real implementation, this would use async local storage
    // For now, return the most recent context
    const contexts = Array.from(this.contexts.values());
    return contexts[contexts.length - 1];
  }
  
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}-${timestamp}-${random}`;
  }
}
```

### Header Propagation
```typescript
class CorrelationHeaderPropagator {
  extractFromHeaders(headers: Map<string, string>): CorrelationContext | null {
    const requestId = headers.get('x-request-id');
    const correlationId = headers.get('x-correlation-id');
    const traceId = headers.get('x-trace-id');
    const userId = headers.get('x-user-id');
    
    if (!requestId) {
      return null;
    }
    
    return {
      requestId,
      correlationId: correlationId || this.generateId('corr'),
      traceId: traceId || this.traceIdGenerator.generateTraceId(),
      userId,
      timestamp: new Date()
    };
  }
  
  injectIntoHeaders(context: CorrelationContext): Map<string, string> {
    const headers = new Map<string, string>();
    
    headers.set('x-request-id', context.requestId);
    headers.set('x-correlation-id', context.correlationId);
    headers.set('x-trace-id', context.traceId);
    
    if (context.userId) {
      headers.set('x-user-id', context.userId);
    }
    
    return headers;
  }
}
```

## Span Sampling

### Sampling Strategy
```typescript
interface SamplingConfig {
  enabled: boolean;
  rate: number;
  maxTracesPerSecond?: number;
}

class SpanSampler {
  private config: SamplingConfig;
  private sampledTraces: Set<string> = new Set();
  
  shouldSample(traceId: string): boolean {
    if (!this.config.enabled) {
      return false;
    }
    
    if (this.sampledTraces.has(traceId)) {
      return true;
    }
    
    const random = Math.random();
    if (random < this.config.rate) {
      this.sampledTraces.add(traceId);
      return true;
    }
    
    return false;
  }
  
  reset(): void {
    this.sampledTraces.clear();
  }
}
```

## Best Practices

### Tracing Guidelines
- Use meaningful operation names
- Include relevant tags for context
- Add events for significant operations
- Use span links for cross-service calls
- Set appropriate span status
- Include error information when applicable

### Correlation Guidelines
- Generate unique IDs for each request
- Propagate correlation IDs across service boundaries
- Include user ID when available
- Use consistent ID formats
- Clean up correlation contexts after request completion

### Performance Considerations
- Use sampling to reduce trace volume
- Implement async span storage
- Cache frequently accessed spans
- Use efficient ID generation
- Implement span cleanup
