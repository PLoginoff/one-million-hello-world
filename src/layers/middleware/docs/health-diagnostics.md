# Health Checks and Diagnostics

## Overview
Health and diagnostics are `MiddlewareManager` methods: `getHealthStatus()` returns scored per-component checks; `runDiagnostics()` returns a traced step-by-step report; `getStatistics()`/`resetStatistics()` track usage. No separate `HealthChecker`/`DiagnosticRunner`/`StatisticsTracker` classes — `MiddlewareHealthCheck` (health/) wraps the manager for external probes.

## Health Checks

### `MiddlewareHealthStatus` / `HealthCheck`

```typescript
interface MiddlewareHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number;              // 0-100
  checks: HealthCheck[];
  lastCheck: Date;
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration?: number;
  timestamp: Date;
}
```

```typescript
const health = manager.getHealthStatus();
health.status; // 'healthy' | 'degraded' | 'unhealthy'
health.checks; // one entry per subsystem: logging, metrics, tracing, correlation, pipelines
```

Checks cover the enabled subsystems (logs/metrics/spans/correlation stores, pipelines, config validity). A `fail` drops the score more than a `warn`; the aggregate maps to `healthy`/`degraded`/`unhealthy`.

## Diagnostics

### `MiddlewareDiagnostics` / `DiagnosticStep` / `DiagnosticSummary`

```typescript
interface MiddlewareDiagnostics {
  traceId: string;
  timestamp: Date;
  steps: DiagnosticStep[];   // { name, status: 'success'|'error'|'warning', duration, message?, details? }
  summary: DiagnosticSummary;// { totalSteps, successfulSteps, failedSteps, warningSteps, overallStatus, totalDuration }
}
```

```typescript
const diag = manager.runDiagnostics();
diag.traceId;            // correlates all steps in this run
diag.summary.overallStatus; // 'success' | 'error' | 'warning'
```

Steps probe logging (`aggregateLogs`), metrics (`getMetrics`/statistics), tracing (active spans), correlation (context count), pipelines (enabled/disabled), and config validation (`MiddlewareConfigValidator`). Each step is timed; a `fail`/`error` step flips `overallStatus`.

## Statistics

### `MiddlewareStatistics`

```typescript
interface MiddlewareStatistics {
  totalLogs: number; totalMetrics: number; totalSpans: number; totalCorrelations: number;
  logsByLevel: Record<LogLevel, number>;
  logsByCategory: Record<LogCategory, number>;
  metricsByType: Record<MetricType, number>;
  spansByStatus: Record<SpanStatus, number>;
  averageLogProcessingTime: number;
  averageMetricProcessingTime: number;
  averageSpanProcessingTime: number;
  memoryUsage: number;
  startTime: Date; uptime: number;
}
```

```typescript
const stats = manager.getStatistics();
stats.logsByLevel[LogLevel.ERROR];       // error volume
stats.averageSpanProcessingTime;         // tracing overhead
manager.resetStatistics();               // reset counters (not buffers)
```

## Best Practices

- Poll `getHealthStatus()` on an interval; alert on `status !== 'healthy'` and on rising `memoryUsage`/`totalLogs`.
- Run `runDiagnostics()` on startup and on incident — the `traceId` lets you correlate the run to logs/spans.
- Call `resetStatistics()` only at clean boundaries (deploy/restart) so `uptime`/rates stay meaningful.
- Pair health with `aggregateLogs({ level: LogLevel.ERROR })` to surface the errors behind a `fail` check.
