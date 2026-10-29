# Statistics Tracking

Four metrics surfaces exist in this layer, each scoped differently.

## In-breaker stats (`CircuitStats`)

`implementations/CircuitBreaker.ts` keeps `CircuitStats` in `_stats`
(`types/circuit-breaker-types.ts`):

```ts
interface CircuitStats {
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  state: CircuitState;
}
```

- `failureCount`/`successCount` are bumped by `_onFailure()` /
  `_onSuccess()`; `successCount` resets on each failure and
  `failureCount` resets when the circuit closes from half-open.
- `lastFailureTime` is stamped on every failure; `state` mirrors
  `_state`. `getStats()` returns a copy; `reset()` zeroes it.

## Execution metrics (`CircuitBreakerMetricsCollector`)

`statistics/CircuitBreakerMetricsCollector.ts` aggregates per-call
operational metrics:

| Metric | Update path |
|--------|-------------|
| `executionCount`        | `recordExecution` |
| `successCount`/`failureCount` | `recordExecution(durationMs, success)` |
| `averageExecutionTime`  | running mean over `durationMs` |
| `lastExecutionTime`     | latest `durationMs` |
| `activeOperations`      | `increment/decrementActiveOperations` |

`getMetrics()` returns a copy; `reset()` zeroes all.

## Request statistics (`CircuitStatisticsCollector`)

`statistics/collectors/CircuitStatisticsCollector.ts` builds a richer
`CircuitStatistics` from `domain/value-objects/CircuitMetrics` +
`domain/entities/CircuitStateEntity`:

`totalRequests`, `successfulRequests`, `failedRequests`,
`rejectedRequests`, `successRate`, `failureRate`, `rejectionRate`,
`averageResponseTime`, `minResponseTime`, `maxResponseTime`,
`stateTransitions`, `currentState`, `timeInCurrentState`, `uptime`,
`downtime`.

## Performance metrics (`CircuitPerformanceMetrics`)

`statistics/metrics/CircuitPerformanceMetrics.ts` adds latency
percentiles: `p95ResponseTime`/`p99ResponseTime` computed by
`_calculatePercentile` over the recorded response-time samples, plus
the usual averages.

## Prometheus export

`metrics/CircuitBreakerPrometheusMetricsCollector.ts` projects the
above into `CircuitBreakerPrometheusMetrics` /
`CircuitBreakerMetricSample` for scraping.

## Fallback instrumentation

`strategies/MetricsCircuitBreakerStrategy.ts` wraps any
`ICircuitBreakerStrategy` and feeds an `InMemoryMetricsCollector`,
counting `execution.fallback` events separately — the direct way to see
how often fallbacks are engaged.
