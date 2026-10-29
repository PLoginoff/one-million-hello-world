# Configuration: Scheduling Layer

## Default Configuration
Defaults are defined in `configuration/defaults/SchedulingDefaults.ts`:

```typescript
export const SchedulingDEFAULTS = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
  strategy: 'default',
  maxConcurrentExecutions: 100,
  cacheEnabled: true,
  cacheTtlMs: 60000,
  metricsEnabled: true,
  healthCheckEnabled: true,
  healthCheckIntervalMs: 30000,
} as const;
```

Limits enforced by the validator (`SchedulingLIMITS`):

| Limit | Value |
|-------|-------|
| `minTimeout` / `maxTimeout` | 1,000 / 300,000 ms |
| `minRetries` / `maxRetries` | 0 / 10 |
| `maxConcurrentExecutions` | 1,000 |
| `maxCacheTtlMs` | 3,600,000 ms |

Valid `strategy` values: `'default'`, `'fast'`, `'reliable'`,
`'cached'`, `'batch'` (`SchedulingSTRATEGIES`).

## Configuration Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | true | Enable/disable the layer |
| timeout | number | 30000 | Operation timeout in ms |
| retries | number | 3 | Retry attempts per execution |
| logLevel | string | "info" | Logging verbosity |
| strategy | string | "default" | Strategy selected via the factory |
| maxConcurrentExecutions | number | 100 | Max parallel executions |
| cacheEnabled | boolean | true | Enable the caching decorator/strategy |
| cacheTtlMs | number | 60000 | Cache entry lifetime |
| metricsEnabled | boolean | true | Collect execution metrics |
| healthCheckEnabled | boolean | true | Expose the health check |
| healthCheckIntervalMs | number | 30000 | Health check cadence |

## Builder and Validator
- `SchedulingConfigurationBuilder` (`configuration/builders/`) — fluent
  construction of the config object.
- `SchedulingConfigurationValidator` (`configuration/validators/`) —
  checks values against `SchedulingLIMITS` and `SchedulingSTRATEGIES`.
