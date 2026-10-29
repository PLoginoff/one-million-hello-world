# Configuration: API Gateway Layer

## Defaults

`configuration/defaults/ApiGatewayDefaults.ts`:

```json
{
  "enabled": true,
  "timeout": 30000,
  "retries": 3,
  "logLevel": "info"
}
```

## Options

| Option     | Type    | Default  | Description |
|------------|---------|----------|-------------|
| `enabled`  | boolean | `true`   | Enable/disable the layer |
| `timeout`  | number  | `30000`  | Operation timeout in ms |
| `retries`  | number  | `3`      | Retry attempts |
| `logLevel` | string  | `"info"` | `debug \| info \| warn \| error` |

## Building & validating

`ApiGatewayConfigurationBuilder` (`configuration/builders/`) exposes
`withEnabled`, `withTimeout`, `withRetries`, `withLogLevel`,
`withStrategy`, `withOption(s)`, `build`.
`ApiGatewayConfigurationValidator` enforces the bounds before
`layer.configure(config)` merges the partial config.

## Strategy selection

`ApiGatewayStrategyFactory.create(name)` accepts
`'default' | 'fast' | 'reliable' | 'cached' | 'batch'` (see
`ApiGatewaySTRATEGIES`); unknown names throw with the available list.

## Adapters

- `HttpApiGatewayAdapter(endpoint, options)` — configure target URL,
  batch size and retry policy per endpoint.
- `RedisApiGatewayAdapter` — configure the Redis connection and stream
  key; events persist to Streams, metrics to hashes/sorted sets.
