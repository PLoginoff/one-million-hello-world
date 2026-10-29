# Configuration: EtlPipeline Layer

## Defaults
`DEFAULT_ETLPIPELINE_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys. `timeout` bounds a single pipeline execution; `retries` applies to failed stages. `EtlPipelineConfigurationBuilder` and validator provide typed construction.

## Strategy configuration
Each strategy takes `Record<string, unknown>` in its constructor; `configure()` merges, `getConfig()` returns a copy, `getExecutionCount()` reports calls. Strategies via `EtlPipelineStrategyFactory`.

## Status inspection
`getStatus()` → `{ config, metrics, active }`; metrics include `successCount`, `failureCount`, `lastExecutionTime` — lastExecutionTime is the key ETL observability signal (job duration drift).
