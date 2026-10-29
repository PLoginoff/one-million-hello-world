# Configuration: Controller Layer

Two config shapes exist — layer runtime config and controller-scope
options.

## Layer defaults (`ControllerDefaults.ts`)

```ts
export const ControllerDEFAULTS = {
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

`ControllerLIMITS` bounds the tunables (`timeout` 1000–300000,
`retries` 0–10, `maxConcurrentExecutions` ≤ 1000, `cacheTtlMs` ≤
3600000). `ControllerSTRATEGIES` =
`['default','fast','reliable','cached','batch']`.

## Controller-scope options (`DefaultConfigs.ts`)

`ControllerConfigOptions` controls registration/DI behaviour:

| Option | Values | Meaning |
|--------|--------|---------|
| `enableAutoRegistration`     | bool | register controllers on startup |
| `enableDependencyInjection`  | bool | resolve controller deps via DI |
| `defaultScope`               | `'singleton' \| 'transient' \| 'request'` | lifetime |
| `maxControllers`             | number | registry cap |
| `enableMiddleware`           | bool | run middleware pipeline |

Named presets:

| Preset | autoReg | DI | scope | max | middleware |
|--------|---------|----|-------|-----|------------|
| `DefaultConfigs.DEFAULT`     | false | true  | transient  | 100 | true |
| `DefaultConfigs.DEVELOPMENT` | true  | true  | transient  | 200 | true |
| `DefaultConfigs.PRODUCTION`  | false | true  | singleton  | 100 | true |
| `DefaultConfigs.MINIMAL`     | false | false | transient  | 50  | false |

`DefaultConfigs.custom(partial)` merges over `DEFAULT`.

## Building & validating

`ControllerConfigurationBuilder` and `ControllerConfigBuilder`
(`configuration/builders/`) produce the two shapes;
`ControllerConfigurationValidator`/`ControllerConfigValidator` check
bounds. `configure(config)` merges the partial config at runtime.
