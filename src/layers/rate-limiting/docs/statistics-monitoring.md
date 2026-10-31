# Statistics and Monitoring

## Overview
Rate limiting statistics, health checks, and diagnostics are exposed directly on `RateLimiter` (`IRateLimiter`) — no separate `StatisticsCollector`/`HealthChecker`/`DiagnosticRunner` classes. Metrics/health components also exist under `statistics/`, `health/`, and `metrics/`.

## Statistics

`getStats(): RateLimitStats` returns aggregate counters; `resetStats()` zeroes them.

```typescript
const stats = limiter.getStats();
stats.totalRequests;
stats.allowedRequests;
stats.deniedRequests;
stats.currentBuckets;
```

Per-identifier usage and bucket introspection:

```typescript
limiter.getBucketInfo(identifier);        // RateLimitBucketInfo | null
limiter.getBucketUsage(identifier);       // RateLimitUsage | null
limiter.getUsageByIdentifier(identifier); // per-id usage
limiter.getTotalUsage();                  // aggregate RateLimitUsage
limiter.getBucketCount();                 // active buckets
limiter.getMetrics();                     // RateLimitMetrics
```

`RateLimitMetricsCollector` (statistics/) and `RateLimitingPrometheusMetricsCollector` (metrics/) roll these counters into exportable samples.

## Health Monitoring

`getHealthStatus(): RateLimitHealthStatus` reports `status`, `score`, and per-check results for the layer. `RateLimitingHealthCheck` (health/) wraps this for periodic probes; `RateLimitingMetricsStrategy` records health alongside checks.

```typescript
const health = limiter.getHealthStatus();
// status: 'healthy' | 'degraded' | 'unhealthy'
// checks: bucket count, memory, denial rate, enabled state
```

Signals to watch: bucket count near capacity, denial rate > 50%, heap usage growth.

## Diagnostics

`runDiagnostics(): RateLimitDiagnostics` runs a structured diagnostic pass with a trace id, timed steps, and a summary — covering config validation, bucket state inspection, and strategy behavior.

```typescript
const diag = limiter.runDiagnostics();
diag.traceId;
diag.steps;   // [{ name, status, duration, message, details }]
diag.summary; // totals + overall status
```

## Warnings

```typescript
limiter.addWarning({ type, message, identifier, timestamp });
limiter.getWarnings();   // RateLimitWarning[]
limiter.clearWarnings();
```

## Internal-Layer and Cross-Layer Stats

```typescript
limiter.getLayerRateLimitStats(layer);           // per-layer stats
limiter.getAllLayerRateLimitStats();
limiter.getLayerHealthStatus(layer);
limiter.getAllLayerHealthStatuses();
limiter.getLayerDependencyGraph();               // layer deps + weights
limiter.checkCrossLayerRateLimit(src, dst);      // cross-layer check
limiter.predictRateLimitUsage(identifier, when); // usage forecast
```

## Best Practices

- Poll `getStats()`/`getHealthStatus()` on an interval; alert on rising `deniedRequests` share and `currentBuckets` growth.
- Use `runDiagnostics()` on deploy and on incident — it validates config, bucket state, and strategy wiring in one pass.
- Export metrics via `RateLimitMetricsCollector`/`PrometheusMetricsCollector`; reset with `resetStats()` only at clear boundaries (deploy/restart).
- Call `cleanupExpiredBuckets()` periodically on long-running processes to bound `currentBuckets`.
