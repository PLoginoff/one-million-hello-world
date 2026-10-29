# Configuration: Decorator Layer

## DecoratorConfig
`DecoratorConfig` (`types/decorator-types.ts`) has exactly two toggles:

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `enableLogging` | boolean | `false` | Adds `'logging'` to the applied-decorator list on `execute()` |
| `enableMetrics` | boolean | `false` | Adds `'metrics'` to the applied-decorator list on `execute()` |

```ts
decorator.setConfig({ enableLogging: true, enableMetrics: false });
decorator.getConfig(); // { enableLogging: true, enableMetrics: false }
```

`setConfig` merges partial config; `getConfig` returns a copy.

## Layer defaults
`DEFAULT_DECORATOR_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`DecoratorConfigurationBuilder` and validators provide typed construction for layer-level config.
