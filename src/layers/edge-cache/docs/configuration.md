# Configuration: EdgeCache Layer

## Defaults
`DEFAULT_EDGECACHE_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys. `EdgeCacheConfigurationBuilder` and validator provide typed construction. `timeout` bounds CDN API calls; `retries` applies to transient edge failures.

## Strategy configuration
Each strategy takes `Record<string, unknown>` in its constructor; `configure()` merges, `getConfig()` returns a copy, `getExecutionCount()` reports calls. Strategies via `EdgeCacheStrategyFactory`.

## Status inspection
`getStatus()` → `{ config, metrics, active }`; metrics include `successCount`, `failureCount`, `lastExecutionTime`.
