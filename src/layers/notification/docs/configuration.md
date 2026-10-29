# Configuration: Notification Layer

## Configuration Shape

`NotificationConfig` (in `types/`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the layer |
| `timeout` | `number` | `30000` | Operation timeout in ms |
| `retries` | `number` | `3` | Retry attempts |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Logging verbosity |

Defaults: `configuration/defaults/NotificationDefaults.ts`.

## Building a Configuration

Use `NotificationConfigurationBuilder` (and `NotificationBuilder` where present)
from `configuration/builders/` to assemble a config object; validate via
`NotificationConfigurationValidator` before applying.

```ts
const config = new NotificationConfigurationBuilder()
  .withTimeout(5000)
  .withRetries(5)
  .build();
```

## Runtime Configuration

`Notification.configure(config)` merges a partial config at runtime;
`getStatus()` returns the active config plus internal metrics.

## Strategy Selection

Strategy is chosen via `NotificationStrategyFactory.create(name)` where
`name` is `default`, `fast`, `reliable`, `cached` or `batch` —
it is not part of `NotificationConfig`.
