# Configuration: DataQuality Layer

## Defaults

`configuration/defaults/DataQualityDefaults.ts` exports `DEFAULT_DATAQUALITY_CONFIG`:

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

`DataQualityConfigurationBuilder` (`configuration/builders/`) exposes
`withEnabled`, `withTimeout`, `withRetries`, `withLogLevel`,
`withStrategy`, `withOption(s)`, `build`.
`DataQualityConfigurationValidator` / `DataQualityValidator` enforce the bounds;
`configure(config)` merges the partial config into the live one.

## Strategy selection

`DataQualityStrategyFactory.create(name)`; unknown names throw with the list
from `getAvailableStrategies()`.
