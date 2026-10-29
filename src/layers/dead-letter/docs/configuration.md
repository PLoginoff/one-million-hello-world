# Configuration: DeadLetter Layer

## Defaults
`DEFAULT_DEADLETTER_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys over current config. `DeadLetterConfigurationBuilder` and `DeadLetterConfigurationValidator` provide typed construction/validation.

## Strategy configuration
Each strategy takes `Record<string, unknown>` in its constructor; `strategy.configure()` merges, `getConfig()` returns a copy, `getExecutionCount()` reports calls.

## Status inspection
`getStatus()` → `{ config, metrics, active }`; metrics include `successCount`, `failureCount`, `lastExecutionTime`.
