# Configuration: Service Layer

## `ServiceConfig` (`types/service-types.ts`)
Passed to `Service.setConfig` / returned by `getConfig`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableCaching` | boolean | false | Route calls through the caching strategy |
| `cacheTimeout` | number | 60,000 | Cache TTL in ms |
| `enableRetry` | boolean | false | Enable `RetryServiceStrategy` |
| `maxRetries` | number | 3 | Max retry attempts before `RetryExhaustedError` |

## `ServiceConfigOptions` presets
`configuration/defaults/DefaultConfigs.ts` ships four presets:

| Preset | `enableAutoRegistration` | `enableHealthCheck` | `healthCheckInterval` | `maxServices` | `enableDiscovery` |
|--------|--------------------------|---------------------|-----------------------|---------------|-------------------|
| `DEFAULT` | false | true | 30,000 | 100 | true |
| `DEVELOPMENT` | true | true | 10,000 | 200 | true |
| `PRODUCTION` | false | true | 30,000 | 100 | true |
| `MINIMAL` | false | false | 60,000 | 50 | false |

## Builders and validators
- `ServiceConfigBuilder` / `ServiceConfigurationBuilder`
  (`configuration/builders/`).
- `ServiceConfigValidator` / `ServiceConfigurationValidator`
  (`configuration/validators/`).
- `ServiceDefaults.ts` (`configuration/defaults/`) — layer constants.
