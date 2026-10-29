# Configuration: MultiTenancy Layer

## Configuration Shape

`MultiTenancyConfig` (in `types/`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the layer |
| `timeout` | `number` | `30000` | Operation timeout in ms |
| `retries` | `number` | `3` | Retry attempts |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Logging verbosity |

Defaults: `configuration/defaults/MultiTenancyDefaults.ts`.

## Building a Configuration

Use `MultiTenancyConfigurationBuilder` (and `MultiTenancyBuilder` where present)
from `configuration/builders/` to assemble a config object; validate via
`MultiTenancyConfigurationValidator` before applying.

```ts
const config = new MultiTenancyConfigurationBuilder()
  .withTimeout(5000)
  .withRetries(5)
  .build();
```

## Runtime Configuration

`MultiTenancy.configure(config)` merges a partial config at runtime;
`getStatus()` returns the active config plus internal metrics.

## Strategy Selection

Strategy is chosen via `MultiTenancyStrategyFactory.create(name)` where
`name` is `default`, `fast`, `reliable`, `cached` or `batch` —
it is not part of `MultiTenancyConfig`.
