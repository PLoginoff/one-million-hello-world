# Logging and Metrics

## Overview
Logging and metrics are `MiddlewareManager` methods (`log`, `logWithCategory`, `recordMetric`, `aggregateLogs`, `aggregateMetrics`, `getFilteredLogs`, `getFilteredMetrics`, `flushLogs`, `flushMetrics`) over types in `types/middleware-types.ts`. `enableLogging`/`enableMetrics` in `MiddlewareConfig` gate them; `MiddlewareMetricsCollector`/`LoggingMiddlewareStrategy`/`MetricsMiddlewareStrategy` plug into the strategy layer.

## Logging

### `LogLevel` and `LogCategory`

```typescript
enum LogLevel    { DEBUG, INFO, WARN, ERROR, FATAL, TRACE }
enum LogCategory { GENERAL, HTTP, DATABASE, CACHE, SECURITY, PERFORMANCE, BUSINESS, SYSTEM }
```

### `LogEntry`

```typescript
interface LogEntry {
  timestamp: Date; level: LogLevel; message: string;
  category?: LogCategory; context?: Record<string, unknown>;
  correlationId?: string; userId?: string;
  source?: string; stackTrace?: string;
  metadata?: LogMetadata;   // hostname, pid, environment, version, tags
}
```

### Writing and Reading

```typescript
manager.log(LogLevel.INFO, 'request received', { uri: req.uri });
manager.logWithCategory(LogLevel.WARN, LogCategory.HTTP, 'slow request', ctx);

manager.getLogs();                    // all entries
manager.getFilteredLogs({
  level, category, startTime, endTime,
  correlationId, userId, messagePattern, limit,
});
manager.aggregateLogs(filter?);       // count, byLevel, byCategory, timeRange, topMessages, errors
manager.flushLogs();                  // emit + clear buffer
manager.clearLogs();
```

Entries carry `correlationId` from `getCorrelationContext`, so `getFilteredLogs({ correlationId })` pulls one request's trail.

### Output

`MiddlewareConfig.logOutputFormat`: `JSON | TEXT | PRETTY`. `logOutputTarget`: `CONSOLE | FILE | REMOTE | BOTH`. `logLevel` filters below-threshold entries; `enableStructuredLogging` keeps the `LogEntry` shape on output.

## Metrics

### Types

```typescript
enum MetricType { COUNTER, GAUGE, HISTOGRAM, SUMMARY }

interface MetricData {
  name: string; type: MetricType; value: number;
  labels?: Record<string, string>;
  timestamp: Date;
  aggregation?: MetricAggregation;    // SUM, AVG, MIN, MAX, COUNT, P50, P95, P99
  unit?: string; description?: string;
}
```

### Recording and Querying

```typescript
manager.recordMetric({ name: 'http.requests', type: MetricType.COUNTER, value: 1, timestamp: new Date() });
manager.recordMetric({ name: 'queue.depth', type: MetricType.GAUGE, value: 42, timestamp: new Date() });

manager.getMetrics();
manager.getFilteredMetrics({ name, type, startTime, endTime, labels, limit });
manager.getMetricStatistics('http.latency');   // count, sum, avg, min, max, p50, p95, p99
manager.aggregateMetrics('http.latency', filter?); // name, type, statistics, timeRange
manager.flushMetrics();   // push + clear per metricsFlushInterval
manager.clearMetrics();
```

`MetricStatistics` gives `p50`/`p95`/`p99` for histogram/summary series; `aggregation` tags a recorded sample with its rollup type.

## Configuration (`MiddlewareConfig`)

```typescript
interface MiddlewareConfig {
  enableLogging: boolean; enableMetrics: boolean;
  enableTracing: boolean;  enableCorrelation: boolean;
  logLevel: LogLevel;
  metricsFlushInterval: number;
  logRetentionDays?: number; metricsRetentionDays?: number;
  enableLogAggregation?: boolean; enableMetricAggregation?: boolean;
  enableSpanSampling?: boolean; spanSamplingRate?: number;
  enableStructuredLogging?: boolean;
  logOutputFormat?: LogOutputFormat;
  logOutputTarget?: LogOutputTarget;
}
```

## Best Practices

- Use `logWithCategory` + structured `context` (never raw secrets) so `aggregateLogs` groups meaningfully.
- Prefer `recordMetric` with `labels` over one metric name per permutation; roll up with `aggregateMetrics`/`getMetricStatistics`.
- Set `metricsFlushInterval` and call `flushMetrics`/`flushLogs` on a timer; clear buffers to bound memory.
- Attach `correlationId` on logs so they stitch to spans (`getFilteredSpans({ traceId })`).
