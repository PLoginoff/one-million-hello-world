# Configuration: FeatureFlags Layer

## Defaults
`DEFAULT_FEATUREFLAGS_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure(config: Record<string, unknown>)` shallow-merges keys — the layer-level kill switch is `enabled: false`, which should map to your "all flags default off" behavior. `FeatureFlagsConfigurationBuilder` and validator provide typed construction.

## Strategy configuration
Each strategy takes `Record<string, unknown>` in its constructor; `configure()` merges, `getConfig()` returns a copy, `getExecutionCount()` reports calls. Strategies via `FeatureFlagsStrategyFactory`. Choose `cached` for request-hot evaluations, `batch` for flag-set bootstrap.

## Status inspection
`getStatus()` → `{ config, metrics, active }`; metrics include `successCount`, `failureCount`, `lastExecutionTime` — watch `failureCount` for flag-backend outages.
