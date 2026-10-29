# Configuration: ContractTesting Layer

## Defaults

`configuration/defaults/ContractTestingDefaults.ts` exports `DEFAULT_CONTRACTTESTING_CONFIG`:

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

`ContractTestingConfigurationBuilder` (`configuration/builders/`) exposes
`withEnabled`, `withTimeout`, `withRetries`, `withLogLevel`,
`withStrategy`, `withOption(s)`, `build`.
`ContractTestingConfigurationValidator` / `ContractTestingValidator` enforce the bounds;
`configure(config)` merges the partial config into the live one.

## Strategy selection

`ContractTestingStrategyFactory.create(name)`; unknown names throw with the list
from `getAvailableStrategies()`.
