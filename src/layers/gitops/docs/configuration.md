# Configuration: Gitops Layer

## Defaults
`DEFAULT_GITOPS_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys. `timeout` bounds a reconcile pass; `retries` applies to transient apply failures. `GitopsConfigurationBuilder` and validator provide typed construction.

## Strategy configuration
Each strategy takes `Record<string, unknown>` in its constructor; `configure()` merges, `getConfig()` returns a copy, `getExecutionCount()` reports calls. Strategies via `GitopsStrategyFactory` — pick `batch` for multi-env sweeps, `reliable` for production applies.

## Status inspection
`getStatus()` → `{ config, metrics, active }`; metrics include `successCount`, `failureCount`, `lastExecutionTime` — reconciliation loop health signals.
