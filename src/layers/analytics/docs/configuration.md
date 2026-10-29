# Configuration: Analytics Layer

## Default configuration

`configuration/defaults/AnalyticsDefaults.ts`:

```json
{
  "enabled": true,
  "timeout": 30000,
  "retries": 3,
  "logLevel": "info"
}
```

## Options

| Option     | Type    | Default | Description |
|------------|---------|---------|-------------|
| `enabled`  | boolean | `true`  | Enable/disable the layer |
| `timeout`  | number  | `30000` | Operation timeout in ms |
| `retries`  | number  | `3`     | Retry attempts for failed executions |
| `logLevel` | string  | `"info"` | One of `debug`, `info`, `warn`, `error` |

## Building configuration

`AnalyticsConfigurationBuilder` (and `AnalyticsBuilder`) in
`configuration/builders/` provide a fluent API:

```ts
const config = new AnalyticsConfigurationBuilder()
  .withTimeout(5000)
  .withLogLevel('debug')
  .build();
```

`AnalyticsConfigurationValidator` / `AnalyticsValidator`
(`configuration/validators/`) check bounds before the config is applied.
`configure(config)` on the layer merges the partial config into the
current one.

## Environment variables

The layer itself reads config programmatically; there are no hardcoded
`process.env` lookups inside it. Wire environment variables in your own
bootstrap (e.g. `ANALYTICS_TIMEOUT`) and pass the parsed values through
`configure()`.
