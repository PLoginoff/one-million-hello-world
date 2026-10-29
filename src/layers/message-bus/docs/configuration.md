# Configuration: MessageBus Layer

## Configuration Shape

`MessageBusConfig` (in `types/message-bus-types.ts`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the layer |
| `timeout` | `number` | `30000` | Operation timeout in ms |
| `retries` | `number` | `3` | Delivery retry attempts |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Logging verbosity |

Defaults are defined in
`configuration/defaults/MessageBusDefaults.ts` as
`DEFAULT_MESSAGEBUS_CONFIG`.

## Building a Configuration

Use `MessageBusConfigurationBuilder` / `MessageBusBuilder` from
`configuration/builders/` to assemble a config object, then validate with
`MessageBusConfigurationValidator` / `MessageBusValidator` before applying.

```ts
const config = new MessageBusConfigurationBuilder()
  .withTimeout(5000)
  .withRetries(5)
  .build();
```

## Runtime Configuration

`MessageBus.configure(config)` merges partial configuration at runtime.
`getStatus()` returns the active config plus internal metrics.

## Strategy Selection

The strategy is not part of `MessageBusConfig`; choose it via
`MessageBusStrategyFactory.create(name)` where `name` is one of
`default`, `fast`, `reliable`, `cached`, `batch`.
