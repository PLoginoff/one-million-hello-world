# Configuration: DisasterRecovery Layer

## Defaults
`DEFAULT_DISASTERRECOVERY_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys. `DisasterRecoveryConfigurationBuilder` and `DisasterRecoveryConfigurationValidator` provide typed construction/validation.

## Strategy configuration
Strategies take `Record<string, unknown>` in their constructors and are created via `DisasterRecoveryStrategyFactory` (there is no `DisasterRecoveryFactory`).

## Status inspection
`getStatus()` returns current config plus initialization state (`_initialized`) — check it before triggering failover orchestration.
