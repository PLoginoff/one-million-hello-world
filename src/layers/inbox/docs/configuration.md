# Configuration: Inbox Layer

## Defaults
`DEFAULT_INBOX_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys. `InboxConfigurationBuilder` and validator provide typed construction.

## Dedup retention
`InboxTimeWindow` (domain value object) models how long message ids are retained — set it ≥ the broker's maximum redelivery window; expired entries can be pruned safely.

## Strategy configuration
Each strategy takes `Record<string, unknown>` in its constructor; `configure()` merges, `getConfig()` returns a copy, `getExecutionCount()` reports calls. Strategies via `InboxStrategyFactory` — `batch` for batched deliveries, `reliable` where double-processing is costly.

## Status inspection
`getStatus()` → `{ config, metrics, active }`; metrics include `successCount`, `failureCount`, `lastExecutionTime`.
