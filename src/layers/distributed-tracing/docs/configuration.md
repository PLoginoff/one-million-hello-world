# Configuration: DistributedTracing Layer

## Defaults
`DEFAULT_DISTRIBUTEDTRACING_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys. `DistributedTracingConfigurationBuilder` and validator provide typed construction.

## Strategy configuration
Each strategy takes `Record<string, unknown>` in its constructor; `configure()` merges, `getConfig()` returns a copy, `getExecutionCount()` reports calls. Strategies are created via `DistributedTracingStrategyFactory`.

## Status inspection
`getStatus()` → `{ config, metrics, active }`; metrics include `successCount`, `failureCount`, `lastExecutionTime`.
