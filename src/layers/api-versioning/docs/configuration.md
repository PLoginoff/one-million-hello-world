# Configuration: API Versioning Layer

## Defaults

`configuration/defaults/ApiVersioningDefaults.ts` exports
`ApiVersioningDEFAULTS`:

```json
{
  "enabled": true,
  "timeout": 30000,
  "retries": 3,
  "logLevel": "info",
  "strategy": "default",
  "maxConcurrentExecutions": 100,
  "cacheEnabled": true,
  "cacheTtlMs": 60000,
  "metricsEnabled": true,
  "healthCheckEnabled": true,
  "healthCheckIntervalMs": 30000
}
```

## Bounds

`ApiVersioningLIMITS`: `timeout` 1000–300000 ms, `retries` 0–10,
`maxConcurrentExecutions` ≤ 1000, `cacheTtlMs` ≤ 3600000.
`ApiVersioningSTRATEGIES` =
`['default','fast','reliable','cached','batch']`.

## Building & validating

`ApiVersioningConfigurationBuilder` — `withEnabled`, `withTimeout`,
`withRetries`, `withLogLevel`, `withStrategy`, `withOption(s)`, `build`.
`ApiVersioningConfigurationValidator` / `ApiVersioningValidator` check
the limits; `configure(config)` merges the partial config at runtime.

## Strategy selection

`ApiVersioningStrategyFactory.create(name)`; unknown names throw with
the list from `getAvailableStrategies()`.
