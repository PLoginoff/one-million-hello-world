# Configuration: Configuration Layer

## Layer defaults

`configuration/defaults/ConfigurationDefaults.ts` exports
`DEFAULT_CONFIGURATION_CONFIG`:

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

## Source adapters

- `new EnvConfigAdapter('APP')` — key `foo` resolves to
  `process.env.APP_FOO`. Change the prefix via the constructor or
  `adapter.configure({ prefix: 'MYAPP' })`.
- `new FileConfigAdapter('/etc/app/config.json')` — seed values with
  `adapter.configure({ filePath: '…', values: { db_url: 'postgres://…' } })`;
  the map is in-memory.

`execute({ input: 'db_url', metadata: {}, timestamp: new Date() })`
returns `{ success: true, data: { key: 'db_url', value, source:
'env' | 'file' } }`, or `CONFIG_NOT_FOUND`.

## Building & validating

`ConfigurationConfigurationBuilder` — `withEnabled`, `withTimeout`,
`withRetries`, `withLogLevel`, `withStrategy`, `withOption(s)`, `build`.
`ConfigurationConfigurationValidator`/`ConfigurationValidator` check
bounds; `configure(config)` merges at runtime.
