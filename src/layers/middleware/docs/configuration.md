# Configuration: Middleware Layer

The real configuration type is `MiddlewareConfig` in
`types/middleware-types.ts`, consumed by `MiddlewareManager`.

## MiddlewareConfig

| Option | Type | Description |
|--------|------|-------------|
| `enableLogging` | `boolean` | Turn on request/response logging |
| `enableMetrics` | `boolean` | Collect `MetricData` counters/timers |
| `enableTracing` | `boolean` | Emit `TraceSpan`s |
| `enableCorrelation` | `boolean` | Assign `CorrelationContext` (x-correlation-id) |
| `logLevel` | `LogLevel` | Minimum log level |
| `metricsFlushInterval` | `number` | Flush interval for metrics (ms) |
| `logRetentionDays` / `metricsRetentionDays` | `number` | Retention windows |
| `enableLogAggregation` / `enableMetricAggregation` | `boolean` | Aggregate logs/metrics |
| `enableSpanSampling` / `spanSamplingRate` | `boolean` / `number` | Sample a fraction of spans |
| `enableStructuredLogging` | `boolean` | Structured `LogEntry` output |
| `logOutputFormat` | `LogOutputFormat` | `JSON`, `TEXT` or `PRETTY` |
| `logOutputTarget` | `LogOutputTarget` | Where logs are written |

## Builders and validation

`configuration/builders/MiddlewareConfigBuilder.ts` /
`MiddlewareConfigurationBuilder.ts` assemble the config;
`configuration/defaults/DefaultConfigs.ts` + `MiddlewareDefaults.ts` hold
defaults; `configuration/validators/MiddlewareConfigValidator.ts` /
`MiddlewareConfigurationValidator.ts` validate.

## Middleware strategies

`strategies/strategy/` provides `IMiddlewareStrategy` implementations:
`LoggingMiddlewareStrategy`, `MetricsMiddlewareStrategy`,
`TracingMiddlewareStrategy`, `RateLimitMiddlewareStrategy`,
`SequentialExecutionStrategy`, `ParallelExecutionStrategy` — wired via
`MiddlewareStrategyFactory` / `MiddlewareFactory`.
