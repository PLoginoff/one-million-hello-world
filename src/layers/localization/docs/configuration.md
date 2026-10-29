# Configuration: Localization Layer

## Defaults
`DEFAULT_LOCALIZATION_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys. `LocalizationConfigurationBuilder` and `LocalizationConfigurationValidator` provide typed construction/validation.

## Strategy configuration
Strategies take `Record<string, unknown>` in their constructors and are created via `LocalizationStrategyFactory` (no `LocalizationFactory` exists). `cached` for repeated key lookups; `batch` for full-catalog loads.

## Status inspection
`getStatus()` returns current config and state for health checks.
