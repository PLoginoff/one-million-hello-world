# Testing Strategy

## Overview
Middleware Layer tests exercise `MiddlewareManager` (the `IMiddlewareManager` implementation), its domain services, entities, value objects, strategies, and error mapping. Tests use `bun:test` and live in `src/layers/middleware/__tests__/`.

## Test Coverage Targets

- **Minimum Coverage**: 95% — **Target**: 99%+
- **Branch Coverage**: 90%+ — **Function Coverage**: 100%
- `MiddlewareManager` and domain services: 99%+
- Strategies, health checks, diagnostics, error mapper: 95%+

## Test Organization

```
src/layers/middleware/__tests__/
├── MiddlewareManager.test.ts            # core API: config, log, metrics, spans, correlation
├── MiddlewareManager.advanced.test.ts   # aggregation, pipelines, diagnostics
├── MiddlewareManager.edge-cases.test.ts
├── MiddlewareManager.integration.test.ts
├── MiddlewareTypes.test.ts              # enums, interfaces, type guards
├── MiddlewareEngine.test.ts
├── MiddlewareErrorMapper.test.ts
├── MiddlewareHealthCheck.test.ts
├── MiddlewareMetricsCollector.test.ts
├── MiddlewareConfiguration.test.ts
└── MiddlewareStrategies.test.ts
```

## Unit Test Examples

### Manager Configuration
```typescript
describe('MiddlewareManager', () => {
  it('returns default configuration', () => {
    const manager = new MiddlewareManager();
    const config = manager.getConfig();
    expect(config.enableLogging).toBe(true);
  });

  it('updates configuration', () => {
    manager.setConfig({ logLevel: LogLevel.WARN });
    expect(manager.getConfig().logLevel).toBe(LogLevel.WARN);
  });
});
```

### Logging
```typescript
it('logs message with level and category', () => {
  manager.logWithCategory(LogLevel.INFO, LogCategory.HTTP, 'request received');
  const logs = manager.getLogs();
  expect(logs[0].level).toBe(LogLevel.INFO);
  expect(logs[0].category).toBe(LogCategory.HTTP);
});

it('does not log when disabled', () => {
  manager.setConfig({ enableLogging: false });
  manager.log(LogLevel.ERROR, 'ignored');
  expect(manager.getLogs()).toHaveLength(0);
});

it('filters logs by level, time, and correlationId', () => {
  const logs = manager.getFilteredLogs({ level: LogLevel.WARN, correlationId: 'corr-1' });
  expect(logs.every(l => l.level === LogLevel.WARN)).toBe(true);
});
```

### Metrics
```typescript
it('records metrics when enabled', () => {
  manager.recordMetric({ name: 'http.requests', type: MetricType.COUNTER, value: 1, timestamp: new Date() });
  const stats = manager.getMetricStatistics('http.requests');
  expect(stats.count).toBe(1);
});

it('aggregates metrics over a filtered range', () => {
  const result = manager.aggregateMetrics('http.latency', { startTime, endTime });
  expect(result.statistics.p95).toBeGreaterThan(0);
});
```

### Tracing
```typescript
it('creates a span and finishes it with duration', async () => {
  const span = manager.createSpan('op');
  await sleep(10);
  manager.finishSpan(span);
  expect(span.endTime).toBeDefined();
  expect(span.duration).toBeGreaterThan(0);
});

it('returns a dummy span when tracing disabled', () => {
  manager.setConfig({ enableTracing: false });
  const span = manager.createSpan('op');
  manager.finishSpan(span);
  expect(manager.getSpans()).toHaveLength(0);
});
```

### Correlation
```typescript
it('creates correlation context from request headers', () => {
  const request = createRequestWithHeaders({
    'x-request-id': 'req-1', 'x-correlation-id': 'corr-1', 'x-trace-id': 'trace-1',
  });
  const ctx = manager.getCorrelationContext(request);
  expect(ctx.requestId).toBe('req-1');
  expect(manager.getCorrelationContextByRequestId('req-1')).toEqual(ctx);
});
```

### Pipelines
```typescript
it('adds, toggles, and removes pipelines and stages', () => {
  manager.addPipeline({ name: 'p1', enabled: true, stages: [] });
  manager.addPipelineStage('p1', { name: 's1', type: StageType.LOGGING, order: 0, enabled: true });
  expect(manager.getPipeline('p1')?.stages).toHaveLength(1);

  manager.disablePipeline('p1');
  expect(manager.getPipeline('p1')?.enabled).toBe(false);

  manager.removePipelineStage('p1', 's1');
  manager.removePipeline('p1');
  expect(manager.getPipeline('p1')).toBeUndefined();
});
```

### Health and Diagnostics
```typescript
it('reports health status and runs diagnostics', () => {
  const health = manager.getHealthStatus();
  expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);

  const diag = manager.runDiagnostics();
  expect(diag.summary.totalSteps).toBeGreaterThan(0);
});
```

## Integration Tests
`MiddlewareManager.integration.test.ts` covers cross-component behavior:
- Correlation context flows into log entries and spans for the same request.
- `MiddlewareExecuted`/`MiddlewareFailed` domain events fire from `MiddlewareExecutionService`.
- Pipeline execution order respects `MiddlewareExecutionOrderValueObject` (first/before/after/last) and `MiddlewarePriority`.
- Strategy behavior: `SequentialExecutionStrategy`, `ParallelExecutionStrategy`, `LoggingMiddlewareStrategy`, `MetricsMiddlewareStrategy`.

## Performance Considerations
- High-volume `log`/`recordMetric`/`createSpan` calls complete within bounded time.
- `getFilteredLogs`/`getFilteredMetrics`/`getFilteredSpans` remain efficient as stores grow.
- `spanSamplingRate` reduces span storage cost under load.

## Running Tests

All tests run under `bun test` (they import from `bun:test`).

```bash
# All layer tests
bun test ./src/layers/middleware/

# Single file
bun test ./src/layers/middleware/__tests__/MiddlewareManager.test.ts

# Coverage
bun test --coverage ./src/layers/middleware/
```

## Best Practices

### Test Writing
- Exercise the `IMiddlewareManager` surface: config, logs, metrics, spans, correlation, pipelines, health, diagnostics.
- Cover enabled/disabled paths for each capability flag in `MiddlewareConfig`.
- Test filtering, aggregation, clearing, and error paths (`MiddlewareErrorMapper`).
- Keep tests independent; reset statistics with `resetStatistics()` where state leaks.

### Performance Testing
- Benchmark high-volume logs/metrics/spans and pipeline execution under concurrency.
- Verify bounded memory by clearing stores and sampling spans.
