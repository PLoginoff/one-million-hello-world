# Tracing and Correlation

## Overview
The Middleware Layer provides distributed tracing (span lifecycle: create, finish, events, links, status) and request correlation (requestId, correlationId, traceId, userId, sessionId, tenantId). Both are implemented by `MiddlewareManager` against the types in `types/middleware-types.ts`. Tracing is gated by `MiddlewareConfig.enableTracing` and `enableSpanSampling`/`spanSamplingRate`; correlation is gated by `enableCorrelation`.

## Distributed Tracing

### TraceSpan
```typescript
interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  tags?: Record<string, unknown>;
  status?: SpanStatus;
  statusCode?: number;
  error?: SpanError;
  events?: SpanEvent[];
  links?: SpanLink[];
}

interface SpanEvent { timestamp: Date; name: string; attributes?: Record<string, unknown>; }
interface SpanLink  { traceId: string; spanId: string; attributes?: Record<string, unknown>; }
interface SpanError { type: string; message: string; stack?: string; code?: string; }

enum SpanStatus {
  OK = 'OK',
  ERROR = 'SPAN_ERROR',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}
```

### Span Lifecycle API
```typescript
const span = manager.createSpan('middleware-request', parentSpanId?);
manager.addSpanEvent(span, { timestamp: new Date(), name: 'cache-lookup', attributes: { hit: true } });
manager.addSpanLink(span, { traceId: 'trace-123', spanId: 'span-456' });
manager.setSpanStatus(span, SpanStatus.ERROR, { type: 'TimeoutError', message: 'upstream timed out' });
manager.finishSpan(span); // sets endTime and duration
```

`finishSpan` records `endTime` and computes `duration`. When `enableTracing` is false, `createSpan` returns a dummy span that is never recorded.

### Querying Spans
```typescript
manager.getSpans();                       // all recorded spans
manager.getSpanById(spanId);
manager.getSpansByTraceId(traceId);
manager.getFilteredSpans({
  traceId, operationName, status,        // optional
  startTime, endTime,
  minDuration, maxDuration, limit,
});
manager.clearSpans();
```

### Span Sampling
Set `enableSpanSampling` and `spanSamplingRate` (0–1) in `MiddlewareConfig` to bound trace volume in production.

## Correlation IDs

### CorrelationContext
```typescript
interface CorrelationContext {
  correlationId: string;
  traceId: string;
  requestId: string;
  userId?: string;
  sessionId?: string;
  tenantId?: string;
  parentRequestId?: string;
}
```

### Creating and Retrieving Contexts
`manager.getCorrelationContext(request)` returns the context for a request, extracting `x-request-id`, `x-correlation-id`, `x-trace-id`, and `x-user-id` headers when present and generating any missing IDs. When `enableCorrelation` is false it returns a dummy context.

```typescript
const ctx = manager.getCorrelationContext(request);
// ctx.requestId, ctx.correlationId, ctx.traceId, ctx.userId?

manager.getCorrelationContextByRequestId('req-123'); // lookup later
manager.clearCorrelationContexts();                  // cleanup
```

### Header Propagation
Forward `x-request-id`, `x-correlation-id`, `x-trace-id`, and `x-user-id` headers on outbound calls so the same `traceId` stitches spans together across services. Incoming requests without headers get fresh generated IDs; `parentRequestId` links nested requests.

### Correlation in Logs
`LogEntry` carries `correlationId` and `userId`, so `manager.log(...)` output can be filtered back to a single request via `getFilteredLogs({ correlationId })`.

## Best Practices

### Tracing Guidelines
- Use meaningful `operationName` values; set `parentSpanId` for nested work.
- Add `SpanEvent`s for significant steps and `SpanLink`s for cross-service calls.
- Always `finishSpan`, and call `setSpanStatus` with a `SpanError` on failure.

### Correlation Guidelines
- Generate unique IDs per request and propagate the headers across service boundaries.
- Attach `userId`/`tenantId` when known; use `parentRequestId` for nested calls.
- Call `clearCorrelationContexts` (and `clearSpans`) to bound memory in long-running processes.

### Performance Considerations
- Use `spanSamplingRate` to reduce trace volume under load.
- Filter with `getFilteredSpans`/`getSpansByTraceId` instead of scanning `getSpans()`.
- Periodically `flushMetrics`/`flushLogs` and clear stored telemetry.
