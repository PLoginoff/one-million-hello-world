# Testing Strategy

## Overview
The Middleware Layer follows a comprehensive testing strategy to ensure correctness, performance, and reliability of middleware operations. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IMiddlewareManager Interface**: 100% (type validation)
- **MiddlewareManager Implementation**: 99%+
- **Logger**: 99%+
- **MetricsCollector**: 99%+
- **Tracer**: 99%+
- **CorrelationManager**: 99%+
- **Pipeline**: 99%+
- **HealthChecker**: 95%+
- **DiagnosticRunner**: 95%+

## Unit Tests

### Test Organization
```
src/layers/middleware/__tests__/
├── unit/
│   ├── logging/
│   │   ├── logger.test.ts
│   │   ├── log-filter.test.ts
│   │   ├── log-aggregator.test.ts
│   │   └── log-formatter.test.ts
│   ├── metrics/
│   │   ├── metrics-collector.test.ts
│   │   ├── metric-statistics.test.ts
│   │   ├── metric-filter.test.ts
│   │   └── metric-flusher.test.ts
│   ├── tracing/
│   │   ├── tracer.test.ts
│   │   ├── span-store.test.ts
│   │   ├── span-filter.test.ts
│   │   └── span-sampler.test.ts
│   ├── correlation/
│   │   ├── correlation-manager.test.ts
│   │   └── header-propagator.test.ts
│   ├── pipeline/
│   │   ├── pipeline.test.ts
│   │   ├── pipeline-manager.test.ts
│   │   ├── pipeline-builder.test.ts
│   │   └── custom-stages.test.ts
│   ├── health/
│   │   ├── health-checker.test.ts
│   │   └── component-checks.test.ts
│   ├── diagnostics/
│   │   ├── diagnostic-runner.test.ts
│   │   └── diagnostic-steps.test.ts
│   └── middleware-manager.test.ts
```

### Unit Test Categories

#### 1. Logger Tests
```typescript
describe('Logger', () => {
  it('should log entry with correct level', () => {
    const logger = new Logger({ defaultLevel: LogLevel.INFO });
    logger.log(LogLevel.INFO, LogCategory.GENERAL, 'Test message');
    
    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe(LogLevel.INFO);
  });

  it('should filter logs below configured level', () => {
    const logger = new Logger({ defaultLevel: LogLevel.WARN });
    logger.log(LogLevel.INFO, LogCategory.GENERAL, 'Info message');
    logger.log(LogLevel.WARN, LogCategory.GENERAL, 'Warn message');
    
    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe(LogLevel.WARN);
  });

  it('should include correlation context in logs', () => {
    const correlationManager = new CorrelationManager();
    const context = correlationManager.createContext('user123');
    correlationManager.setContext(context);
    
    const logger = new Logger({ correlationManager });
    logger.log(LogLevel.INFO, LogCategory.GENERAL, 'Test message');
    
    const logs = logger.getLogs();
    expect(logs[0].requestId).toBe(context.requestId);
    expect(logs[0].traceId).toBe(context.traceId);
  });

  it('should format logs according to output format', () => {
    const logger = new Logger({ outputFormat: LogOutputFormat.JSON });
    logger.log(LogLevel.INFO, LogCategory.GENERAL, 'Test message');
    
    const logs = logger.getLogs();
    const formatted = logger.formatEntry(logs[0]);
    
    expect(() => JSON.parse(formatted)).not.toThrow();
  });
});
```

#### 2. Metrics Collector Tests
```typescript
describe('Metrics Collector', () => {
  it('should increment counter metric', () => {
    const collector = new MetricsCollector();
    collector.increment('test.counter', 1);
    
    const metrics = collector.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].type).toBe(MetricType.COUNTER);
    expect(metrics[0].value).toBe(1);
  });

  it('should set gauge metric', () => {
    const collector = new MetricsCollector();
    collector.set('test.gauge', 42);
    
    const metrics = collector.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].type).toBe(MetricType.GAUGE);
    expect(metrics[0].value).toBe(42);
  });

  it('should observe histogram metric', () => {
    const collector = new MetricsCollector();
    collector.observe('test.histogram', 100);
    
    const metrics = collector.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].type).toBe(MetricType.HISTOGRAM);
  });

  it('should record timing metric', () => {
    const collector = new MetricsCollector();
    collector.timing('test.timing', 150);
    
    const metrics = collector.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].type).toBe(MetricType.SUMMARY);
    expect(metrics[0].value).toBe(150);
  });
});
```

#### 3. Tracer Tests
```typescript
describe('Tracer', () => {
  it('should start span with generated IDs', () => {
    const tracer = new Tracer();
    const span = tracer.startSpan('test-operation');
    
    expect(span.traceId).toBeDefined();
    expect(span.spanId).toBeDefined();
    expect(span.operationName).toBe('test-operation');
  });

  it('should create parent-child span relationship', () => {
    const tracer = new Tracer();
    const parentSpan = tracer.startSpan('parent');
    const childSpan = tracer.startSpan('child', parentSpan.spanId);
    
    expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
  });

  it('should calculate span duration on finish', () => {
    const tracer = new Tracer();
    const span = tracer.startSpan('test-operation');
    
    await sleep(100);
    tracer.finishSpan(span.spanId);
    
    const finishedSpan = tracer.spanStore.getBySpanId(span.spanId);
    expect(finishedSpan?.duration).toBeGreaterThan(90);
  });

  it('should add event to span', () => {
    const tracer = new Tracer();
    const span = tracer.startSpan('test-operation');
    
    tracer.addEvent(span.spanId, 'test-event', { key: 'value' });
    
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('test-event');
  });

  it('should add link to span', () => {
    const tracer = new Tracer();
    const span = tracer.startSpan('test-operation');
    
    tracer.addLink(span.spanId, 'trace-123', 'span-456');
    
    expect(span.links).toHaveLength(1);
    expect(span.links[0].traceId).toBe('trace-123');
  });
});
```

#### 4. Correlation Manager Tests
```typescript
describe('Correlation Manager', () => {
  it('should create correlation context with unique IDs', () => {
    const manager = new CorrelationManager();
    const context = manager.createContext();
    
    expect(context.requestId).toBeDefined();
    expect(context.correlationId).toBeDefined();
    expect(context.traceId).toBeDefined();
  });

  it('should associate user ID with context', () => {
    const manager = new CorrelationManager();
    const context = manager.createContext('user123');
    
    expect(context.userId).toBe('user123');
  });

  it('should retrieve context by request ID', () => {
    const manager = new CorrelationManager();
    const context = manager.createContext();
    
    const retrieved = manager.getContext(context.requestId);
    expect(retrieved).toBe(context);
  });

  it('should clear context by request ID', () => {
    const manager = new CorrelationManager();
    const context = manager.createContext();
    
    manager.clearContext(context.requestId);
    const retrieved = manager.getContext(context.requestId);
    
    expect(retrieved).toBeUndefined();
  });
});
```

#### 5. Pipeline Tests
```typescript
describe('Pipeline', () => {
  it('should execute stages in order', async () => {
    const pipeline = new Pipeline();
    const executionOrder: string[] = [];
    
    pipeline.addStage({
      id: 'stage1',
      type: PipelineStageType.CUSTOM,
      name: 'Stage 1',
      order: 0,
      enabled: true,
      config: {},
      handler: async () => { executionOrder.push('stage1'); }
    });
    
    pipeline.addStage({
      id: 'stage2',
      type: PipelineStageType.CUSTOM,
      name: 'Stage 2',
      order: 1,
      enabled: true,
      config: {},
      handler: async () => { executionOrder.push('stage2'); }
    });
    
    const context = createMiddlewareContext();
    await pipeline.execute(context);
    
    expect(executionOrder).toEqual(['stage1', 'stage2']);
  });

  it('should skip disabled stages', async () => {
    const pipeline = new Pipeline();
    let executed = false;
    
    pipeline.addStage({
      id: 'disabled-stage',
      type: PipelineStageType.CUSTOM,
      name: 'Disabled Stage',
      order: 0,
      enabled: false,
      config: {},
      handler: async () => { executed = true; }
    });
    
    const context = createMiddlewareContext();
    await pipeline.execute(context);
    
    expect(executed).toBe(false);
  });

  it('should not execute when disabled', async () => {
    const pipeline = new Pipeline();
    let executed = false;
    
    pipeline.addStage({
      id: 'stage1',
      type: PipelineStageType.CUSTOM,
      name: 'Stage 1',
      order: 0,
      enabled: true,
      config: {},
      handler: async () => { executed = true; }
    });
    
    pipeline.disable();
    
    const context = createMiddlewareContext();
    await pipeline.execute(context);
    
    expect(executed).toBe(false);
  });
});
```

## Integration Tests

### Full Pipeline Integration Tests
```typescript
describe('Middleware Pipeline Integration', () => {
  it('should execute complete middleware pipeline', async () => {
    const pipeline = new PipelineBuilder('request-pipeline')
      .addLogging(loggingConfig)
      .addMetrics(metricsConfig)
      .addTracing(tracingConfig)
      .addCorrelation(correlationConfig)
      .build();
    
    const request = createTestRequest();
    const context = createMiddlewareContext({ request });
    
    await pipeline.execute(context);
    
    expect(context.correlationContext).toBeDefined();
    expect(context.span).toBeDefined();
  });

  it('should handle pipeline errors gracefully', async () => {
    const pipeline = new PipelineBuilder('error-pipeline')
      .addCustom({
        id: 'failing-stage',
        type: PipelineStageType.CUSTOM,
        name: 'Failing Stage',
        order: 0,
        enabled: true,
        config: {},
        handler: async () => { throw new Error('Stage failed'); }
      })
      .build();
    
    const context = createMiddlewareContext();
    
    await expect(pipeline.execute(context)).rejects.toThrow();
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should log within time limit', () => {
    const logger = new Logger({ defaultLevel: LogLevel.INFO });
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      logger.log(LogLevel.INFO, LogCategory.GENERAL, 'Test message');
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 1000 logs
  });

  it('should collect metrics within time limit', () => {
    const collector = new MetricsCollector();
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      collector.increment('test.counter', 1);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(50); // < 50ms for 1000 metrics
  });

  it('should trace within time limit', () => {
    const tracer = new Tracer();
    const start = Date.now();
    
    for (let i = 0; i < 100; i++) {
      const span = tracer.startSpan('test-operation');
      tracer.finishSpan(span.spanId);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 100 spans
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createMiddlewareContext(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
  return {
    request: createTestRequest(),
    metadata: new Map(),
    correlationContext: createCorrelationContext(),
    span: undefined,
    ...overrides
  };
}

function createCorrelationContext(): CorrelationContext {
  return {
    requestId: 'req-123',
    correlationId: 'corr-456',
    traceId: 'trace-789',
    userId: 'user-abc',
    timestamp: new Date()
  };
}

function createTestRequest(): HttpRequest {
  return {
    method: HttpMethod.GET,
    uri: '/api/test',
    version: HttpVersion.HTTP_1_1,
    headers: new Map([
      ['x-request-id', 'req-123'],
      ['x-correlation-id', 'corr-456']
    ]),
    body: Buffer.alloc(0),
    remoteAddress: '192.168.1.1',
    securityContext: createSecurityContext()
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/middleware
```

### Integration Tests
```bash
npm run test:integration -- src/layers/middleware
```

### Performance Tests
```bash
npm run test:performance -- src/layers/middleware
```

### All Tests
```bash
npm test -- src/layers/middleware
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/middleware
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Middleware Tests

on:
  pull_request:
    paths:
      - 'src/layers/middleware/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/middleware
      - run: npm run test:integration -- src/layers/middleware
      - run: npm run test:performance -- src/layers/middleware
      - run: npm run test:coverage -- src/layers/middleware
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all middleware components
- Test pipeline execution order
- Test error handling scenarios
- Test health and diagnostic functionality
- Test correlation ID propagation
- Test metric aggregation
- Test log filtering
- Maintain test independence

### Performance Testing Guidelines
- Test with high volume of logs/metrics
- Test with concurrent pipeline execution
- Test memory usage under load
- Test ID generation performance
- Test span storage efficiency
- Test configuration updates

### Integration Testing Guidelines
- Test complete pipeline execution
- Test cross-component interaction
- Test error propagation
- Test correlation context flow
- Test span lifecycle
