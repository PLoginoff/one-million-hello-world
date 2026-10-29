# Configuration: DataWarehouse Layer

## Defaults
`DEFAULT_DATAWAREHOUSE_CONFIG` (`configuration/defaults/DataWarehouseDefaults.ts`):

```ts
{
  enabled: true,
  timeout: 30000,   // ms
  retries: 3,
  logLevel: 'info'  // 'debug' | 'info' | 'warn' | 'error'
}
```

## Applying configuration
`DataWarehouse.configure(config: Record<string, unknown>)` shallow-merges the given keys over the current config. There is no built-in environment-variable loader in this layer — supply values from your own config source.

## Builders and validators (`configuration/`)
- `DataWarehouseConfigurationBuilder` — fluent builder producing a `DataWarehouseConfig`
- `DataWarehouseBuilder` — assembles a configured layer instance
- `DataWarehouseConfigurationValidator` / `DataWarehouseValidator` — validate config objects (checked in `DataWarehouseConfiguration.test.ts`)

## Strategy configuration
Each strategy constructor accepts `Record<string, unknown>`; `strategy.configure()` merges additional options and `getConfig()` returns a copy. Strategies also expose `getExecutionCount()` for diagnostics.

## Status inspection
`getStatus()` returns `{ config, metrics, active }` where `metrics` contains `successCount`, `failureCount`, and `lastExecutionTime` counters collected during `execute()`.
