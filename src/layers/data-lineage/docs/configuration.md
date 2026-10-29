# Configuration: DataLineage Layer

## Defaults

`configuration/defaults/DataLineageDefaults.ts` exports `DataLineageDEFAULTS`:

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

`DataLineageLIMITS`: `timeout` 1000–300000 ms, `retries` 0–10,
`maxConcurrentExecutions` ≤ 1000, `cacheTtlMs` ≤ 3600000.
`DataLineageSTRATEGIES` = `['default','fast','reliable','cached','batch']`.

## Building & validating

`DataLineageConfigurationBuilder` (`configuration/builders/`) exposes
`withEnabled`, `withTimeout`, `withRetries`, `withLogLevel`,
`withStrategy`, `withOption(s)`, `build`.
`DataLineageConfigurationValidator` / `DataLineageValidator` enforce the bounds;
`configure(config)` merges the partial config into the live one.

## Strategy selection

`DataLineageStrategyFactory.create(name)`; unknown names throw with the list
from `getAvailableStrategies()`.
