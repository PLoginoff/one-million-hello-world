# Configuration: Identity Layer

## Defaults
`DEFAULT_IDENTITY_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys. `IdentityConfigurationBuilder` and validator provide typed construction.

## Strategy configuration
Each strategy takes `Record<string, unknown>` in its constructor; `configure()` merges, `getConfig()` returns a copy, `getExecutionCount()` reports calls. Strategies via `IdentityStrategyFactory` — `cached` for repeated lookups, `batch` for bulk provisioning.

## Status inspection
`getStatus()` → `{ config, metrics, active }`; metrics include `successCount`, `failureCount`, `lastExecutionTime`.
